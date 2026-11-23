import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { setTimeout as delay } from 'node:timers/promises'
import yauzl from 'yauzl'

const repository = 'JetBrains/junie-acp-release'
export const stableVersion = /^\d{1,8}\.\d{1,8}$/
const archiveLimit = 512 * 1024 * 1024
const layouts = {
  darwin: { family: 'macos', entry: 'Applications/junie.app/Contents/MacOS/junie' },
  linux: { family: 'linux', entry: 'junie-app/bin/junie' },
  win32: { family: 'windows', entry: 'junie/junie.exe' },
}

export function releasePlatform(platform = process.platform, arch = process.arch) {
  const architecture = { arm64: 'aarch64', x64: 'amd64' }[arch]
  return layouts[platform] && architecture ? { ...layouts[platform], architecture } : undefined
}

async function githubResponse(request, url, options, errorMessage) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    options.signal.throwIfAborted()
    try { return await request(url, options) }
    catch {
      options.signal.throwIfAborted()
      if (attempt === 0) await delay(200, undefined, { signal: options.signal })
    }
  }
  throw new Error(errorMessage)
}

function assetPath(platform, version) {
  return '/' + repository + '/releases/download/' + version + '/junie-release-'
    + version + '-' + platform.family + '-' + platform.architecture + '.zip'
}

async function publicRelease(platform, signal, request) {
  const origin = 'https://github.com'
  const path = '/' + repository + '/releases'
  const options = { redirect: 'manual', signal }
  const error = 'Could not verify the latest Junie CLI build on the public GitHub release page.'
  const latest = await githubResponse(request, origin + path + '/latest', options, error)
  const location = latest.headers.get('location')
  await latest.body?.cancel()
  const tag = location && new URL(location, origin)
  if (latest.status !== 302 || !tag || tag.origin !== origin || tag.username || tag.password || tag.search || tag.hash
      || !tag.pathname.startsWith(path + '/tag/')) throw new Error(error)
  const version = tag.pathname.slice((path + '/tag/').length)
  if (!stableVersion.test(version)) throw new Error(error)
  const assets = await githubResponse(request, origin + path + '/expanded_assets/' + version, options, error)
  if (!assets.ok) throw new Error(error)

  // The public asset listing includes GitHub's exact digest for its asset.
  // Its display size is rounded, so downloadArchive uses a byte cap in this path.
  const download = assetPath(platform, version)
  const html = await assets.text()
  const row = (html.match(/<li\b[^>]*>[\s\S]*?<\/li>/g) ?? []).find(item => item.includes('href="' + download + '"'))
  const digest = row?.match(/\bvalue="sha256:([a-f0-9]{64})"/)?.[1]
  if (!digest) throw new Error(error)
  return { version, url: origin + download, digest }
}

export async function officialRelease(platform, signal, request = fetch) {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(15_000)])
  const response = await githubResponse(request, 'https://api.github.com/repos/' + repository + '/releases/latest', {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'Ekko-Studio-Junie' },
    redirect: 'error', signal: deadline,
  }, 'Could not connect to JetBrains release metadata on GitHub.')
  if ([403, 429].includes(response.status)) {
    await response.body?.cancel()
    return publicRelease(platform, deadline, request)
  }
  if (!response.ok) throw new Error('Could not check for a stable Junie CLI release on GitHub.')
  const release = await response.json()
  const version = release.tag_name
  if (release.draft !== false || release.prerelease !== false || !stableVersion.test(version)) {
    throw new Error('JetBrains did not publish a valid stable Junie CLI version.')
  }
  const path = assetPath(platform, version)
  const url = 'https://github.com' + path
  const asset = Array.isArray(release.assets) && release.assets.find(candidate => candidate?.name === path.split('/').at(-1))
  if (asset?.state !== 'uploaded' || asset.browser_download_url !== url
      || !/^sha256:[a-f0-9]{64}$/.test(asset.digest)
      || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > archiveLimit) {
    throw new Error('The stable JetBrains release has no verifiable Junie CLI archive for this platform.')
  }
  return { version, url, digest: asset.digest.slice(7), size: asset.size }
}

export async function downloadArchive(release, file, signal, request = fetch) {
  let url = new URL(release.url)
  for (let hop = 0; hop < 4; hop += 1) {
    const response = await githubResponse(request, url, { redirect: 'manual', signal }, 'Could not connect to the official Junie CLI download.')
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel()
      const location = response.headers.get('location')
      if (!location) throw new Error('JetBrains download returned an invalid redirect.')
      url = new URL(location, url)
      if (url.protocol !== 'https:' || url.username || url.password || url.port
          || !['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(url.hostname)) {
        throw new Error('JetBrains download redirected outside GitHub release assets.')
      }
      continue
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel()
      throw new Error('Could not download the official Junie CLI archive.')
    }
    const advertisedSize = response.headers.get('content-length')
    const expected = release.size ?? (/^\d+$/.test(advertisedSize) ? Number(advertisedSize) : undefined)
    if (expected !== undefined && (!Number.isSafeInteger(expected) || expected <= 0 || expected > archiveLimit)) {
      await response.body.cancel()
      throw new Error('Junie CLI archive exceeds its download size limit.')
    }
    let size = 0
    const digest = createHash('sha256')
    const verify = new Transform({
      transform(chunk, _encoding, callback) {
        size += chunk.length
        if (size > (expected ?? archiveLimit)) return callback(new Error('Junie CLI archive exceeds its published size.'))
        digest.update(chunk)
        callback(null, chunk)
      },
    })
    await pipeline(Readable.fromWeb(response.body), verify, createWriteStream(file, { flags: 'wx', mode: 0o600 }), { signal })
    if ((expected !== undefined && size !== expected) || digest.digest('hex') !== release.digest) {
      throw new Error('Junie CLI archive does not match the published size and SHA-256.')
    }
    return
  }
  throw new Error('Too many redirects when downloading Junie CLI.')
}

export async function extractArchive(file, directory, signal) {
  const zip = await yauzl.openPromise(file, { strictFileNames: false })
  let total = 0, count = 0
  try {
    for await (const entry of zip.eachEntry()) {
      signal.throwIfAborted()
      const folder = entry.fileName.endsWith('/')
      const parts = entry.fileName.replace(/\/$/, '').split('/')
      const mode = entry.externalFileAttributes >>> 16
      const type = mode & 0o170000
      if (++count > 12_000 || (total += entry.uncompressedSize) > 2 * archiveLimit
          || !parts.every(part => part && part !== '.' && part !== '..' && !/[:\\\x00]/.test(part)
            && !/[. ]$/.test(part) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))
          || (type && type !== (folder ? 0o040000 : 0o100000))) {
        throw new Error('Junie CLI archive contains an unsafe or unsupported entry.')
      }
      const destination = join(directory, ...parts)
      if (folder) await mkdir(destination, { recursive: true, mode: 0o755 })
      else {
        await mkdir(dirname(destination), { recursive: true, mode: 0o755 })
        const stream = await zip.openReadStreamPromise(entry)
        await pipeline(stream, createWriteStream(destination, { flags: 'wx', mode: mode & 0o111 ? 0o755 : 0o644 }), { signal })
      }
    }
  } finally {
    zip.close()
  }
}
