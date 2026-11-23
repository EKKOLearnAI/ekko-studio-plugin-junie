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
