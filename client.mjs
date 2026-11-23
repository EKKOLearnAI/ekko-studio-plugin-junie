const instructions = {
  en: ['Run this command in a terminal on the Studio host as the Studio service user.', 'Install Junie CLI in Agent management first.', 'The login command is unavailable for this account or Profile.'],
  zh: ['在 Studio 宿主上，以 Studio 服务用户在终端运行此命令。', '请先在 Agent 管理中安装 Junie CLI。', '此账号或 Profile 无法读取登录命令。'],
  'zh-TW': ['在 Studio 主機上，以 Studio 服務使用者在終端機執行此命令。', '請先在 Agent 管理中安裝 Junie CLI。', '此帳號或 Profile 無法讀取登入命令。'],
  ja: ['Studio ホストで、Studio サービスのユーザーとしてターミナルでこのコマンドを実行してください。', 'Agent 管理で Junie CLI をインストールしてください。', 'このアカウントまたはプロファイルではログインコマンドを取得できません。'],
  ko: ['Studio 호스트에서 Studio 서비스 사용자로 터미널에서 이 명령을 실행하세요.', '먼저 Agent 관리에서 Junie CLI를 설치하세요.', '이 계정 또는 프로필에서는 로그인 명령을 사용할 수 없습니다.'],
  fr: ['Exécutez cette commande dans un terminal sur l’hôte Studio avec le compte système du service.', 'Installez d’abord Junie CLI dans la gestion des agents.', 'La commande de connexion est indisponible pour ce compte ou profil.'],
  es: ['Ejecuta este comando en una terminal del host de Studio con el usuario del servicio.', 'Instala primero Junie CLI en la gestión de agentes.', 'El comando de inicio de sesión no está disponible para esta cuenta o perfil.'],
  de: ['Führen Sie diesen Befehl auf dem Studio-Host im Terminal als Studio-Dienstbenutzer aus.', 'Installieren Sie zuerst Junie CLI in der Agent-Verwaltung.', 'Für dieses Konto oder Profil ist kein Anmeldebefehl verfügbar.'],
  pt: ['Execute este comando em um terminal no host do Studio com o usuário do serviço.', 'Instale primeiro o Junie CLI no gerenciamento de agentes.', 'O comando de login está indisponível nesta conta ou perfil.'],
  ru: ['Выполните эту команду в терминале хоста Studio от имени пользователя службы.', 'Сначала установите Junie CLI в управлении агентами.', 'Команда входа недоступна для этой учётной записи или профиля.'],
  ar: ['شغّل هذا الأمر في الطرفية على مضيف Studio باستخدام حساب مستخدم الخدمة.', 'ثبّت Junie CLI أولًا من إدارة الوكلاء.', 'أمر تسجيل الدخول غير متاح لهذا الحساب أو الملف الشخصي.'],
  tr: ['Bu komutu Studio ana makinesindeki bir terminalde Studio hizmet kullanıcısı olarak çalıştırın.', 'Önce Agent yönetiminden Junie CLI kurun.', 'Bu hesap veya profil için oturum açma komutu kullanılamıyor.'],
}

export async function mount(root, ctx) {
  const requested = String(ctx.locale || 'en').replaceAll('_', '-').toLowerCase()
  const locale = Object.keys(instructions).find(key => key.toLowerCase() === requested)
    ?? (Object.hasOwn(instructions, requested.split('-')[0]) ? requested.split('-')[0] : 'en')
  const [explain, missing, unavailable] = instructions[locale]
  root.lang = locale
  root.dir = locale === 'ar' ? 'rtl' : 'ltr'
  root.style.padding = '16px'
  if (ctx.view !== 'native-login') return mountNativeSettings(root, ctx, locale)
  const hint = document.createElement('p')
  root.append(hint)
  try {
    const { command, junieWordmark } = await ctx.rpc.call('native-login')
    hint.textContent = command ? explain : missing
    if (command) {
      const block = document.createElement('pre')
      block.dir = 'ltr'
      block.style.whiteSpace = 'pre-wrap'
      block.style.overflowWrap = 'anywhere'
      const code = document.createElement('code')
      code.textContent = command
      block.append(code)
      root.append(block)
    }
    const branding = document.createElement('figure')
    branding.style.margin = '24px 0 0'
    const link = document.createElement('a')
    link.href = 'https://www.jetbrains.com/'
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.style.display = 'inline-block'
    link.style.padding = '8px'
    link.style.backgroundColor = '#fff'
    const wordmark = document.createElement('img')
    wordmark.src = junieWordmark
    wordmark.alt = 'Junie by JetBrains'
    wordmark.width = 116
    wordmark.style.display = 'block'
    link.append(wordmark)
    branding.append(link)
    const notice = document.createElement('figcaption')
    const copyright = document.createElement('small')
    copyright.textContent = 'Copyright © 2026 JetBrains s.r.o. Junie and the Junie logo are trademarks of JetBrains s.r.o.'
    notice.append(copyright)
    branding.append(notice)
    root.append(branding)
  } catch {
    hint.textContent = unavailable
  }
}

const labels = {
  en: ['Add', 'Save', 'Remove', 'Reload', 'Name', 'Select an entry', 'Saved', 'Remove this entry?', 'Global user settings. Scoped uses its own configuration.', 'Default discovery is disabled or could not be confirmed.', 'Only this SKILL.md is edited or removed. Supporting files stay in place.', 'Stored connection values are hidden. Enter fields to replace, or null to clear a field.', 'Only model, effort, skill-default-locations and mcp-default-locations are edited. Other values stay in the file.', 'Default configuration files are disabled by the service environment.', 'Read-only entry'],
  zh: ['添加', '保存', '移除', '重新读取', '名称', '选择条目', '已保存', '移除此条目？', '这里编辑 Global 的用户级设置。Scoped 使用独立配置。', '默认发现已关闭或无法确认。', '编辑和移除只作用于此 SKILL.md，保留附属文件。', '已保存的连接参数已隐藏。填写要替换的字段，或用 null 清除字段。', '只编辑 model、effort、skill-default-locations 和 mcp-default-locations，保留其他字段。', 'Studio 服务环境关闭了默认配置文件。', '只读条目'],
  'zh-TW': ['新增', '儲存', '移除', '重新讀取', '名稱', '選擇項目', '已儲存', '移除此項目？', '此處編輯 Global 的使用者設定。Scoped 使用獨立設定。', '預設探索已關閉或無法確認。', '只編輯或移除此 SKILL.md，保留附屬檔案。', '已儲存的連線參數已隱藏。輸入要替換的欄位，或用 null 清除欄位。', '只編輯 model、effort、skill-default-locations 和 mcp-default-locations，保留其他欄位。', 'Studio 服務環境已停用預設設定檔。', '唯讀項目'],
  ja: ['追加', '保存', '削除', '再読み込み', '名前', '項目を選択', '保存済み', 'この項目を削除しますか？', 'Global のユーザー設定を編集します。Scoped は独立した設定を使用します。', '既定の検出は無効か、確認できません。', 'この SKILL.md だけを編集または削除します。付属ファイルは保持されます。', '接続設定の保存値は非表示です。変更する項目を入力し、削除には null を使用します。', 'model、effort、skill-default-locations、mcp-default-locations のみ編集します。', 'サービス環境で既定の構成ファイルが無効です。', '読み取り専用'],
  ko: ['추가', '저장', '제거', '다시 읽기', '이름', '항목 선택', '저장됨', '이 항목을 제거할까요?', 'Global 사용자 설정입니다. Scoped는 별도 설정을 사용합니다.', '기본 검색이 꺼져 있거나 확인되지 않았습니다.', '이 SKILL.md만 수정하거나 제거합니다. 부속 파일은 유지됩니다.', '저장된 연결 값은 숨겨집니다. 바꿀 필드를 입력하거나 null로 지우세요.', 'model, effort, skill-default-locations, mcp-default-locations만 편집합니다.', '서비스 환경에서 기본 설정 파일이 비활성화되었습니다.', '읽기 전용'],
  fr: ['Ajouter', 'Enregistrer', 'Supprimer', 'Recharger', 'Nom', 'Sélectionner une entrée', 'Enregistré', 'Supprimer cette entrée ?', 'Paramètres utilisateur Global. Scoped utilise sa propre configuration.', 'La recherche par défaut est désactivée ou indéterminée.', 'Seul ce SKILL.md est modifié ou supprimé. Les fichiers associés sont conservés.', 'Les valeurs de connexion sont masquées. Saisissez les champs à remplacer ou null pour les effacer.', 'Seuls model, effort, skill-default-locations et mcp-default-locations sont modifiés.', 'L’environnement du service désactive les fichiers de configuration par défaut.', 'Lecture seule'],
  es: ['Añadir', 'Guardar', 'Quitar', 'Recargar', 'Nombre', 'Seleccionar entrada', 'Guardado', '¿Quitar esta entrada?', 'Configuración de usuario Global. Scoped usa su propia configuración.', 'La detección predeterminada está desactivada o no se pudo confirmar.', 'Solo se edita o quita este SKILL.md. Se conservan los archivos auxiliares.', 'Los valores de conexión se ocultan. Introduce los campos que deseas reemplazar o elimínalos con null.', 'Solo se editan model, effort, skill-default-locations y mcp-default-locations.', 'El entorno del servicio desactiva los archivos de configuración predeterminados.', 'Solo lectura'],
  de: ['Hinzufügen', 'Speichern', 'Entfernen', 'Neu laden', 'Name', 'Eintrag auswählen', 'Gespeichert', 'Diesen Eintrag entfernen?', 'Globale Benutzereinstellungen. Scoped verwendet eine eigene Konfiguration.', 'Die Standardsuche ist deaktiviert oder konnte nicht bestätigt werden.', 'Nur diese SKILL.md wird bearbeitet oder entfernt. Begleitdateien bleiben erhalten.', 'Verbindungswerte sind ausgeblendet. Felder können ersetzt oder mit null entfernt werden.', 'Bearbeitbar sind nur model, effort, skill-default-locations und mcp-default-locations.', 'Die Dienstumgebung deaktiviert die Standardkonfigurationsdateien.', 'Schreibgeschützt'],
  pt: ['Adicionar', 'Salvar', 'Remover', 'Recarregar', 'Nome', 'Selecionar entrada', 'Salvo', 'Remover esta entrada?', 'Configuração de usuário Global. Scoped usa configuração própria.', 'A descoberta padrão está desativada ou não foi confirmada.', 'Apenas este SKILL.md é editado ou removido. Os arquivos auxiliares são preservados.', 'Os valores de conexão estão ocultos. Informe os campos a substituir ou use null para limpar.', 'Apenas model, effort, skill-default-locations e mcp-default-locations são editados.', 'O ambiente do serviço desativa os arquivos de configuração padrão.', 'Somente leitura'],
  ru: ['Добавить', 'Сохранить', 'Удалить', 'Перезагрузить', 'Имя', 'Выберите запись', 'Сохранено', 'Удалить запись?', 'Настройки пользователя Global. Scoped использует отдельную конфигурацию.', 'Обнаружение по умолчанию отключено или не подтверждено.', 'Изменяется или удаляется только SKILL.md. Дополнительные файлы сохраняются.', 'Данные подключения скрыты. Укажите заменяемые поля или null для очистки.', 'Доступны model, effort, skill-default-locations и mcp-default-locations.', 'Служебное окружение отключает файлы конфигурации по умолчанию.', 'Только чтение'],
  ar: ['إضافة', 'حفظ', 'إزالة', 'إعادة التحميل', 'الاسم', 'اختر عنصرًا', 'تم الحفظ', 'هل تريد إزالة هذا العنصر؟', 'إعدادات مستخدم Global. يستخدم Scoped إعدادات منفصلة.', 'الاكتشاف الافتراضي معطّل أو لم يتم تأكيده.', 'يُعدّل أو يُزال ملف SKILL.md فقط. تبقى الملفات المرفقة.', 'قيم الاتصال المخزّنة مخفية. أدخل الحقول لاستبدالها أو استخدم null لمسحها.', 'يمكن تحرير model وeffort وskill-default-locations وmcp-default-locations فقط.', 'تعطّل بيئة الخدمة ملفات الإعدادات الافتراضية.', 'للقراءة فقط'],
  tr: ['Ekle', 'Kaydet', 'Kaldır', 'Yeniden yükle', 'Ad', 'Bir kayıt seçin', 'Kaydedildi', 'Bu kayıt kaldırılsın mı?', 'Global kullanıcı ayarları. Scoped kendi yapılandırmasını kullanır.', 'Varsayılan keşif kapalı veya doğrulanamadı.', 'Yalnız bu SKILL.md düzenlenir veya kaldırılır. Ek dosyalar korunur.', 'Kayıtlı bağlantı değerleri gizli. Değişecek alanları girin veya temizlemek için null kullanın.', 'Yalnız model, effort, skill-default-locations ve mcp-default-locations düzenlenir.', 'Hizmet ortamı varsayılan yapılandırma dosyalarını devre dışı bırakıyor.', 'Salt okunur'],
}

const editorStyle = `
  .junie-settings { max-width: 920px; color: var(--text-primary, CanvasText); }
  .junie-settings h1 { margin: 0 0 8px; font-size: 19px; }
  .junie-settings p { margin: 8px 0; }
  .junie-settings code { overflow-wrap: anywhere; }
  .junie-settings fieldset { padding: 0; border: 0; margin: 16px 0 0; min-width: 0; }
  .junie-settings label { display: grid; gap: 5px; margin: 12px 0; }
  .junie-settings textarea, .junie-settings input, .junie-settings select, .junie-settings button {
    color: inherit; border: 1px solid var(--border-default, GrayText); border-radius: 6px;
    background: var(--surface-input, Canvas); font: inherit; padding: 7px 9px;
  }
  .junie-settings textarea { font: 13px/1.5 ui-monospace, monospace; resize: vertical; min-height: 160px; }
  .junie-settings select { max-width: 360px; }
  .junie-settings button:disabled { opacity: .6; }
  .junie-settings .actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
`

function node(tag, text = '') {
  const element = document.createElement(tag)
  element.textContent = text
  return element
}
function button(text) {
  const element = node('button', text)
  element.type = 'button'
  return element
}
function field(parent, name, input) {
  const label = node('label')
  label.append(node('span', name), input)
  parent.append(label)
  return label
}

async function mountNativeSettings(root, ctx, locale) {
  const [addText, saveText, removeText, reloadText, nameText, chooseText, savedText, confirmText, scopeText,
    discoveryText, skillHelp, mcpHelp, configHelp, disabledText, readOnlyText] = labels[locale]
  const kind = ctx.view
  const title = ctx.plugin.i18n?.[locale]?.views?.[kind] ?? ctx.plugin.views.find(view => view.id === kind).title
  const list = kind === 'skills' || kind === 'mcp'
  const skills = kind === 'skills'
  const readRpc = list ? skills ? 'native-skills-list' : 'native-mcp-list' : 'native-config-read'
  const editorTitle = skills ? 'SKILL.md' : 'JSON'
  const area = node('section')
  area.className = 'junie-settings'
  const path = node('code')
  path.dir = 'ltr'
  const availability = node('p')
  const status = node('p')
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  const toolbar = node('div')
  toolbar.className = 'actions'
  const controls = node('fieldset')
  const edit = node('div')
  edit.hidden = list
  const selected = node('select')
  selected.setAttribute('aria-label', chooseText)
  const add = button(addText), save = button(saveText), remove = button(removeText), reload = button(reloadText)
  const key = node('input')
  key.maxLength = skills ? 64 : 128
  key.dir = 'ltr'
  if (list) field(edit, nameText, key)
  const content = node('textarea')
  content.rows = 12
  content.dir = 'ltr'
  content.spellcheck = false
  field(edit, editorTitle, content)
  const actions = node('div')
  actions.className = 'actions'
  actions.append(save)
  if (list) actions.append(remove)
  edit.append(node('p', list ? skills ? skillHelp : mcpHelp : configHelp), actions)
  if (list) toolbar.append(selected, add)
  toolbar.append(reload)
  controls.append(toolbar, edit)
  area.append(node('h1',title), node('p',scopeText), path, availability, status, controls)
  const style = node('style',editorStyle)
  root.append(style,area)
  let current, revision = '', creating = false, active = true, busy = false
  ctx.lifecycle.add(() => { active = false })
  if (skills) key.oninput = () => {
    if (creating && !content.dataset.edited) content.value = '---\nname: ' + key.value + '\ndescription: \n---\n'
  }
  content.oninput = () => { content.dataset.edited = 'true' }

  async function operation(action) {
    if (busy || !active) return
    busy = true
    status.textContent = ''
    controls.disabled = true
    controls.setAttribute('aria-busy', 'true')
    try { await action() }
    catch (error) { if (active) status.textContent = error?.message || String(error) }
    finally {
      busy = false
      if (active) {
        controls.disabled = false
        controls.setAttribute('aria-busy', 'false')
      }
    }
  }

  function show(name, text, readOnly = false) {
    key.value = name
    key.readOnly = list && !creating
    content.value = text
    delete content.dataset.edited
    content.readOnly = readOnly
    save.disabled = readOnly
    remove.disabled = creating || readOnly
    edit.hidden = false
  }

  async function showEntry(name) {
    const row = current.entries.find(item => item.name === name)
    if (!row) { edit.hidden = true; return }
    creating = false
    edit.hidden = true
    if (!skills) {
      show(name,'{}')
      return
    }
    if (!row.editable) { show(name,'',true); status.textContent = readOnlyText; return }
    const skill = await ctx.rpc.call('native-skill-read',{name})
    revision = skill.revision
    show(name,skill.markdown)
  }

  async function load(name = '') {
    edit.hidden = true
    current = await ctx.rpc.call(readRpc)
    path.textContent = current.path
    revision = current.revision
    if (!list) {
      availability.textContent = current.enabled ? '' : disabledText
      show('',current.content,!current.enabled)
      return
    }
    availability.textContent = current.discovery === 'enabled' ? '' : discoveryText
    const prompt = new Option(chooseText,'')
    selected.replaceChildren(prompt,...current.entries.map(row => new Option(
      row.transport ? row.name + ' · ' + row.transport + (row.timeout === undefined ? '' : ' · ' + row.timeout + ' ms') : row.name,row.name)))
    selected.value = name
    await showEntry(selected.value)
  }

  selected.onchange = () => operation(() => showEntry(selected.value))
  reload.onclick = () => operation(() => load(list ? selected.value : ''))
  add.onclick = () => operation(async () => {
    await load()
    creating = true
    revision = skills ? 'missing' : current.revision
    show('',skills ? '---\nname: \ndescription: \n---\n' : '{}')
    key.focus()
  })
  save.onclick = () => operation(async () => {
    const name = key.value.trim()
    if (list && creating && current.entries.some(row => row.name === name)) throw new Error(name + ' · ' + chooseText)
    if (list) {
      const input = { name, revision, ...(skills ? { markdown:content.value } : { patch:content.value }) }
      await ctx.rpc.call(skills ? 'native-skill-write' : 'native-mcp-write',input)
    } else await ctx.rpc.call('native-config-write',{revision,content:content.value})
    await load(name)
    status.textContent = savedText
  })
  remove.onclick = () => operation(async () => {
    if (!await ctx.ui.confirm(confirmText)) return
    await ctx.rpc.call(skills ? 'native-skill-remove' : 'native-mcp-remove',{name:key.value,revision})
    await load()
    status.textContent = savedText
  })
  await operation(() => load())
}
