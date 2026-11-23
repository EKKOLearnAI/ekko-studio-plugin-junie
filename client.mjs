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
  if (ctx.view !== 'native-login') {
    const t = interfaceText[locale] ?? interfaceText.en
    const style = el('style', themeStyles)
    root.append(style)
    bindTheme(root, ctx)
    if (ctx.view === 'native-config') return mountConfiguration(root, ctx, t, labels[locale], [explain, missing, unavailable])
    return mountResources(root, ctx, t, labels[locale])
  }
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

// Layout adapted from the MIT-licensed Ekko Studio Cline settings pages.
const themeStyles = `
  :root{--ju-space:var(--spacing-scale,1);--ju-border:var(--border-width,1px) solid var(--border-color);color-scheme:var(--studio-color-scheme,normal)}
  html,body,#root{height:100%;min-height:0;margin:0}#root{padding:0}
  .ju-settings *,.ju-manager *{box-sizing:border-box}
  .ju-settings,.ju-manager{display:flex;flex-direction:column;width:100%;height:100%;min-height:0;min-width:0;color:var(--text-primary);font:var(--font-size-base,14px)/var(--line-height,1.6) var(--font-family,system-ui);letter-spacing:var(--letter-spacing,normal)}
  .ju-settings button,.ju-manager button{display:inline-flex;align-items:center;justify-content:center;gap:calc(6px * var(--ju-space));min-height:var(--control-height,28px);padding:4px 10px;border:var(--ju-border);border-radius:var(--radius-component,6px);background:transparent;line-height:1.4;cursor:pointer;white-space:nowrap;transition:background .15s,border-color .15s}
  .ju-settings button:hover,.ju-manager button:hover{background:var(--bg-secondary)}
  .ju-settings button.primary,.ju-manager button.primary{background:var(--accent-primary);border-color:var(--accent-primary);color:var(--ju-on-accent)}
  .ju-settings button.quiet,.ju-manager button.quiet{border-color:transparent}
  .ju-manager button.danger{color:var(--error,var(--text-secondary))}
  .ju-settings button:disabled,.ju-manager button:disabled{opacity:.5;cursor:default}
  .ju-settings input,.ju-settings textarea,.ju-manager input:not([type=checkbox]),.ju-manager textarea{padding:5px 10px;border:var(--ju-border);border-radius:var(--radius-component,6px);background:var(--theme-input-bg,var(--bg-input,var(--bg-secondary)));color:var(--text-primary);font:inherit;min-width:0;max-width:100%}
  .ju-settings input:disabled,.ju-settings textarea:disabled,.ju-manager input:disabled,.ju-manager textarea:disabled{cursor:default;opacity:.5}
  .ju-settings textarea,.ju-manager textarea{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:calc(var(--font-size-base,14px) * 13 / 14);line-height:1.6;resize:vertical}
  .ju-settings :focus-visible,.ju-manager :focus-visible{outline:2px solid var(--accent-primary);outline-offset:2px}
  .ju-page-header{display:flex;flex-shrink:0;align-items:center;justify-content:space-between;gap:calc(12px * var(--ju-space));flex-wrap:wrap;padding:calc(12px * var(--ju-space)) calc(20px * var(--ju-space));border-bottom:var(--ju-border)}
  .ju-page-header h1{font-size:calc(var(--font-size-base,14px) * 16 / 14);font-weight:600;line-height:1.5;margin:0}
  .ju-page-header .ju-buttons{margin-inline-start:auto}
  .ju-page-content{flex:1;min-height:0;overflow:auto;padding:calc(20px * var(--ju-space));display:flex;flex-direction:column;gap:calc(16px * var(--ju-space));min-width:0}
  .ju-manager p,.ju-settings p{margin:0;color:var(--text-secondary);overflow-wrap:anywhere}
  .ju-source-path{display:block;font:calc(var(--font-size-base,14px) * 12 / 14)/1.6 ui-monospace,monospace;color:var(--text-muted,var(--text-secondary));overflow-wrap:anywhere}
  .ju-source-info{font-size:calc(var(--font-size-base,14px) * 12 / 14);color:var(--text-secondary)}
  .ju-source-info summary{cursor:pointer}.ju-source-info p,.ju-source-info code{margin-top:8px}
  .ju-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:calc(12px * var(--ju-space))}
  .ju-stat{padding:calc(14px * var(--ju-space));border:var(--ju-border);border-radius:var(--radius-component,8px);background:var(--theme-card-bg,var(--bg-card));display:flex;flex-direction:column;gap:6px}
  .ju-stat span{font-size:calc(var(--font-size-base,14px) * 11 / 14);color:var(--text-muted,var(--text-secondary))}.ju-stat strong{font-size:calc(var(--font-size-base,14px) * 24 / 14);font-weight:600;line-height:1}.ju-stat.active strong{color:var(--success,var(--accent-primary))}
  .ju-toolbar,.ju-buttons{display:flex;align-items:center;gap:calc(8px * var(--ju-space));flex-wrap:wrap}
  .ju-toolbar .ju-buttons{margin-inline-start:auto}
  .ju-manager .ju-toolbar input{flex:1;max-width:360px;min-width:0}
  .ju-items{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,420px),1fr));gap:calc(14px * var(--ju-space))}
  .ju-row{display:flex;flex-direction:column;gap:calc(12px * var(--ju-space));padding:calc(16px * var(--ju-space));border:var(--ju-border);border-radius:var(--radius-component,8px);background:var(--theme-card-bg,var(--bg-card));min-width:0}
  .ju-summary{flex:1;min-width:0;overflow-wrap:anywhere}.ju-summary strong{font-size:calc(var(--font-size-base,14px) * 15 / 14);font-weight:600}.ju-summary p{font-size:calc(var(--font-size-base,14px) * 13 / 14);margin-top:8px}
  .ju-summary .ju-source-path{margin-top:4px;color:var(--text-secondary)}
  .ju-row-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
  .ju-row-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;border-top:var(--ju-border);padding-top:10px}
  .ju-manager button.ju-switch{flex-shrink:0;min-height:18px;width:32px;height:18px;padding:2px;justify-content:flex-start;border:0;border-radius:12px;background:var(--text-muted)}
  .ju-manager button.ju-switch[aria-checked=true]{background:var(--accent-primary)}
  .ju-switch::after{content:'';width:14px;height:14px;border-radius:50%;background:var(--ju-on-accent);transition:transform .15s}
  .ju-switch[aria-checked=true]::after{transform:translateX(14px)}
  .ju-badges{display:flex;gap:6px;flex-wrap:wrap}
  .ju-badge{display:inline-flex;padding:1px 7px;border:var(--ju-border);border-radius:var(--radius-component,4px);font-size:calc(var(--font-size-base,14px) * 11 / 14);color:var(--text-secondary)}
  .ju-badge.active{color:var(--success,var(--accent-primary));border-color:currentColor}
  .ju-empty{grid-column:1/-1;text-align:center;padding:48px 16px}
  .ju-dialog{width:min(600px,calc(100vw - 32px));max-height:calc(100vh - 32px);padding:0;border:var(--ju-border);border-radius:var(--radius-component,12px);background:var(--theme-overlay-bg,var(--bg-card));color:var(--text-primary)}
  .ju-dialog::backdrop{background:color-mix(in srgb,var(--text-primary) 30%,transparent)}
  .ju-editor{display:flex;flex-direction:column;gap:calc(16px * var(--ju-space));padding:calc(24px * var(--ju-space));min-width:0}.ju-editor[hidden]{display:none}
  .ju-editor h2{font-size:18px;margin:0;font-weight:600}.ju-editor fieldset{border:0;margin:0;padding:0;display:flex;flex-direction:column;gap:16px;min-width:0}
  .ju-editor label{display:flex;flex-direction:column;gap:6px}.ju-editor label strong{font-size:14px;font-weight:500}.ju-editor label p{font-size:12px}
  .ju-editor [hidden]{display:none}
  .ju-editor textarea{min-height:220px;width:100%}
  .ju-editor>.ju-buttons{justify-content:flex-end;border-top:var(--ju-border);padding-top:16px}
  .ju-message{white-space:pre-wrap;overflow-wrap:anywhere}.ju-message:empty{display:none}.ju-message[role=alert]{border-inline-start:3px solid var(--accent-primary);padding-inline-start:12px}
  .ju-settings [data-theme-surface=card],.ju-manager [data-theme-surface=card]{--ju-border:var(--border-width,1px) solid var(--theme-card-border,var(--border-color));border-radius:var(--theme-card-radius,var(--radius-component,8px));box-shadow:var(--theme-card-shadow,none)}
  .ju-settings [data-theme-surface=input],.ju-manager [data-theme-surface=input]{--ju-border:var(--border-width,1px) solid var(--theme-input-border,var(--border-color));border-radius:var(--theme-input-radius,var(--radius-component,6px));box-shadow:var(--theme-input-shadow,none)}
  .ju-dialog{--ju-border:var(--border-width,1px) solid var(--theme-overlay-border,var(--border-color));border-radius:var(--theme-overlay-radius,var(--radius-component,12px));box-shadow:var(--theme-overlay-shadow,none)}
  .ju-settings-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:calc(16px * var(--ju-space));min-width:0}
  .ju-section{display:flex;flex-direction:column;gap:12px;min-width:0;border:var(--ju-border);border-radius:var(--radius-component,10px);padding:calc(16px * var(--ju-space));background:var(--theme-card-bg,var(--bg-card))}
  .ju-section h2{font-size:calc(var(--font-size-base,14px) * 14 / 14);font-weight:600;margin:0}.ju-runtime{grid-column:1/-1}
  .ju-runtime-heading{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.ju-runtime-heading p{font-size:12px}.ju-runtime-heading button{margin-inline-start:auto}.ju-runtime>p{font-size:12px}
  .ju-runtime .ju-field{display:grid;grid-template-columns:minmax(160px,1fr) minmax(200px,1fr);align-items:center;gap:4px 24px;margin:0}.ju-runtime .ju-field p{grid-column:1;font-size:12px}.ju-runtime .ju-field input{grid-column:2;grid-row:1/3}
  .ju-field{display:flex;flex-direction:column;gap:6px;margin:0}.ju-field strong{font-size:13px;font-weight:500}.ju-field input,.ju-field textarea{width:100%}.ju-field p{font-size:12px}
  .ju-section .ju-field:has(textarea){flex:1}.ju-field textarea{flex:1;min-height:260px}
  .ju-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.ju-settings a{color:var(--accent-primary)}.ju-settings summary{cursor:pointer;color:var(--text-secondary)}.ju-settings pre{white-space:pre-wrap;overflow-wrap:anywhere}
  .ju-skills .ju-page-content{padding:0;overflow:hidden;gap:0}
  .ju-skills-layout{display:flex;flex:1;min-width:0;min-height:0}
  .ju-skills-sidebar{display:flex;flex-direction:column;width:280px;flex-shrink:0;min-height:0;border-inline-end:var(--ju-border);overflow:auto}
  .ju-skills-sidebar .ju-source-info{padding:12px;border-top:var(--ju-border);margin-top:auto}
  .ju-skills-sidebar .ju-message{padding:12px}
  .ju-skills .ju-items{display:flex;flex-direction:column;gap:2px;padding:8px}
  .ju-skill-group{margin:8px 4px 4px;font-size:12px;font-weight:500;color:var(--text-muted)}
  .ju-manager .ju-skill-select{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-width:0;text-align:start;padding:8px 12px;border-color:transparent;background:transparent;white-space:normal}
  .ju-manager .ju-skill-select[aria-pressed=true]{background:color-mix(in srgb,var(--accent-primary) 10%,transparent);color:var(--text-primary)}
  .ju-skill-select strong,.ju-skill-select small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ju-skill-select strong{font-size:13px;font-weight:500}.ju-skill-select small{font-size:11px;color:var(--text-muted,var(--text-secondary))}.ju-skill-select .ju-summary{overflow:hidden}
  .ju-skill-dot{width:6px;height:6px;flex-shrink:0;border-radius:50%;background:var(--text-muted)}.ju-skill-dot.active{background:var(--success,var(--accent-primary))}
  .ju-skill-detail{display:flex;flex-direction:column;flex:1;min-width:0;min-height:0;overflow:auto;padding:calc(16px * var(--ju-space)) calc(20px * var(--ju-space));gap:12px}
  .ju-detail-heading{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding-bottom:12px;border-bottom:var(--ju-border)}.ju-detail-heading h2{margin:0;font-size:15px;font-weight:600;overflow-wrap:anywhere}
  .ju-file-heading{padding:8px 0;border-bottom:var(--ju-border);font:12px ui-monospace,monospace;color:var(--text-muted)}
  .ju-skill-content{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.7 ui-monospace,SFMono-Regular,Menlo,monospace}
  .ju-skills .ju-toolbar input{max-width:200px}.ju-manager .ju-back{display:none}
  @media(max-width:768px){.ju-page-header{padding:12px;gap:10px}.ju-page-content{padding:12px}.ju-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.ju-items,.ju-settings-grid{grid-template-columns:1fr}.ju-dialog{width:calc(100vw - 24px)}.ju-editor{padding:16px}.ju-manager .ju-toolbar input{max-width:none}.ju-runtime .ju-field{display:flex;align-items:stretch;gap:6px}.ju-skills-sidebar{width:100%;border:0}.ju-skill-detail{display:none;padding:12px}.ju-show-detail .ju-skills-sidebar{display:none}.ju-show-detail .ju-skill-detail{display:flex}.ju-manager .ju-back{display:inline-flex}.ju-skills .ju-toolbar{flex:1;justify-content:flex-end}.ju-skills .ju-toolbar input{width:100%;max-width:180px;flex-basis:120px}}
  .ju-empty:only-child{margin:auto}
  .ju-file-heading,.ju-source-path,.ju-document{direction:ltr;text-align:start}
  .ju-source-info[open]{padding-bottom:8px}
  .ju-note{font-size:calc(var(--font-size-base,14px) * 12 / 14)}
  .ju-settings .ju-actions{margin-inline-start:auto}
  .ju-settings .ju-field textarea{direction:ltr;text-align:start}
  .ju-section code{overflow-wrap:anywhere}
  .ju-document{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.7 ui-monospace,SFMono-Regular,Menlo,monospace}
  .ju-preview-line{display:flex;gap:10px;flex-wrap:wrap}
  @media(max-width:400px){.ju-stats{grid-template-columns:repeat(3,minmax(0,1fr))}.ju-stat{padding:8px}}
`

const interfaceText = {
  en: {
    addSkill: 'Add skill', addMcp: 'Add MCP server', searchSkill: 'Search name or description', searchMcp: 'Search servers',
    skills: 'Skill list', emptySkills: 'No skills yet. Add a skill to get started.', emptyMcp: 'No MCP servers yet. Add a server to get started.',
    noMatches: 'No matching items', sources: 'Sources and when changes apply', local: 'Local global', total: 'Total',
    on: 'User default discovery on', off: 'User default discovery off', unknown: 'User default discovery not confirmed',
    enabledHelp: 'Check or change individual Skill activation in Junie with /skills.',
    connectionsHelp: 'The switch applies on the next Global turn when Junie loads this user file. For live status, OAuth or servers from other locations, use /mcp in terminal Junie with the same JUNIE_HOME. ACP /mcp is read-only.',
    configuredOn: 'Configured on', configuredOff: 'Configured off', disable: 'Disable', enable: 'Enable',
    previewHelp: 'Executable and script paths show only the filename. HTTP(S) shows only the origin. Credentials and other arguments stay hidden.',
    moreArgs: 'Additional arguments hidden',
    scopeHelp: 'This page only manages the default user location. Trusted projects and extra Junie locations can also supply resources.',
    sameHome: 'Global and the native CLI use the same JUNIE_HOME when started with the same environment.',
    description: 'Description', descriptionHelp: 'If left blank, Junie uses the first paragraph of the Markdown.',
    body: 'Skill content (Markdown)', bodyHelp: 'Enter instructions. The name and description are written to the native YAML header.',
    nameHelp: 'Use lowercase letters, numbers and hyphens for a Skill. The name identifies the folder.',
    rawHelp: 'Edit the complete UTF-8 file, including the YAML frontmatter. The name must match the folder.',
    editRaw: 'Edit full SKILL.md', editFields: 'Edit fields', readOnlySkillHelp: 'Linked or unreadable files can be managed from their native source.',
    mcpNameHelp: 'The name identifies this server in mcp.json.',
    transportHelp: 'Use command, args and env for stdio or url and headers for HTTP(S). Timeout is in milliseconds.',
    mcpJson: 'Server configuration (JSON)', mcpPatch: 'Changes (JSON)', savedFields: 'Saved fields', masked: 'Stored value hidden',
    unsupported: 'Unrecognized configuration', unsupportedHelp: 'Review the native file to edit this server format.',
    edit: 'Edit', view: 'View', cancel: 'Cancel', close: 'Close', discard: 'Discard unsaved changes?',
    duplicate: 'This name already exists. Edit the existing entry.', loading: 'Loading…',
    runtime: 'Runtime', cliFound: 'CLI available', cliMissing: 'CLI unavailable', manage: 'Open Agent management',
    login: 'Terminal sign-in command', globalSettings: 'Global configuration', scope: 'Sources and scope',
    configJson: 'Junie configuration (JSON)', examples: 'View configuration example', docs: 'Junie configuration docs',
    fallback: 'Omit a supported field to restore Junie’s default or let another native source set it.',
    extra: 'Manage credentials, custom model profiles, settings.json, project trust and extra sources in the native CLI.',
    precedence: 'Launch flags and trusted project configuration can override user defaults.',
  },
  zh: {
    addSkill: '添加 Skill', addMcp: '添加 MCP 服务', searchSkill: '搜索名称或描述', searchMcp: '搜索服务',
    skills: 'Skill 列表', emptySkills: '还没有 Skill，点击“添加 Skill”开始。', emptyMcp: '还没有 MCP 服务，点击“添加 MCP 服务”开始。',
    noMatches: '没有匹配的项目', sources: '来源与生效方式', local: '本机全局', total: '全部',
    on: '用户默认发现已开启', off: '用户默认发现已关闭', unknown: '无法确认用户默认发现状态',
    enabledHelp: '在 Junie 中使用 /skills 查询或切换单项 Skill 的启用状态。',
    connectionsHelp: '开关保存用户配置，Junie 加载此文件时在下一轮 Global 会话生效。实时状态、OAuth 和其他来源的服务可用相同的 JUNIE_HOME 启动终端 Junie 后通过 /mcp 管理。ACP 的 /mcp 是只读的。',
    configuredOn: '配置已启用', configuredOff: '配置已停用', disable: '停用', enable: '启用',
    previewHelp: '可执行文件和脚本只显示文件名，HTTP(S) 只显示源站。凭证和其他参数值保持隐藏。',
    moreArgs: '其余参数已隐藏',
    scopeHelp: '此页面只管理用户默认位置。受信任的项目和 Junie 额外位置也可提供资源。',
    sameHome: 'Global 与使用相同环境启动的原生 CLI 共用 JUNIE_HOME。',
    description: '描述', descriptionHelp: '留空时，Junie 使用 Markdown 的首个正文段落。',
    body: 'Skill 内容（Markdown）', bodyHelp: '输入正文，名称和描述会写入原生 YAML 文件头。',
    nameHelp: 'Skill 名称使用小写字母、数字和连字符。名称同时用于文件夹。',
    rawHelp: '编辑完整的 UTF-8 文件及 YAML 文件头。名称必须与文件夹一致。',
    editRaw: '编辑完整 SKILL.md', editFields: '编辑字段', readOnlySkillHelp: '链接或不可读文件请从原生来源管理。',
    mcpNameHelp: '名称对应 mcp.json 中的服务条目。',
    transportHelp: 'stdio 使用 command、args、env，HTTP(S) 使用 url、headers。timeout 单位为毫秒。',
    mcpJson: '服务配置（JSON）', mcpPatch: '变更内容（JSON）', savedFields: '已保存字段', masked: '已隐藏保存值',
    unsupported: '无法识别的配置', unsupportedHelp: '请查看原生文件以编辑这种服务格式。',
    edit: '编辑', view: '查看', cancel: '取消', close: '关闭', discard: '放弃尚未保存的编辑？',
    duplicate: '这个名称已经存在，请编辑现有项目。', loading: '正在读取…',
    runtime: '运行环境', cliFound: 'CLI 可用', cliMissing: 'CLI 不可用', manage: '打开 Agent 管理',
    login: '终端登录命令', globalSettings: 'Global 配置', scope: '来源与作用域',
    configJson: 'Junie 配置（JSON）', examples: '查看配置示例', docs: 'Junie 配置文档',
    fallback: '移除受支持的字段后，由 Junie 默认行为或其他原生配置来源决定。',
    extra: '凭证、自定义模型文件、settings.json、项目授权和额外来源由原生 CLI 管理。',
    precedence: '启动参数和受信任项目的配置可以覆盖用户默认值。',
  },
  'zh-TW': {
    addSkill: '新增 Skill', addMcp: '新增 MCP 服務', searchSkill: '搜尋名稱或描述', searchMcp: '搜尋服務',
    skills: 'Skill 清單', emptySkills: '還沒有 Skill，請選擇「新增 Skill」。', emptyMcp: '還沒有 MCP 服務，請選擇「新增 MCP 服務」。',
    noMatches: '沒有符合的項目', sources: '來源與套用方式', local: '本機全域', total: '全部',
    on: '使用者預設探索已啟用', off: '使用者預設探索已停用', unknown: '無法確認使用者預設探索狀態',
    enabledHelp: '在 Junie 中使用 /skills 查詢或切換個別 Skill 的啟用狀態。',
    connectionsHelp: '開關儲存使用者設定，Junie 載入此檔案時在下一輪 Global 工作階段套用。即時狀態、OAuth 和其他來源的服務可用相同的 JUNIE_HOME 啟動終端機 Junie，再用 /mcp 管理。ACP 的 /mcp 為唯讀。',
    configuredOn: '設定已啟用', configuredOff: '設定已停用', disable: '停用', enable: '啟用',
    previewHelp: '可執行檔與指令碼只顯示檔名，HTTP(S) 只顯示來源站點。憑證和其他參數值維持隱藏。',
    moreArgs: '其餘參數已隱藏',
    scopeHelp: '本頁僅管理使用者預設位置。受信任的專案和 Junie 額外位置也可以提供資源。',
    sameHome: 'Global 與在相同環境啟動的原生 CLI 共用 JUNIE_HOME。',
    description: '描述', descriptionHelp: '留空時，Junie 使用 Markdown 的第一個正文段落。',
    body: 'Skill 內容（Markdown）', bodyHelp: '輸入正文，名稱與描述會寫入原生 YAML 檔頭。',
    nameHelp: 'Skill 名稱使用小寫英數字與連字號。名稱同時用於資料夾。',
    rawHelp: '編輯完整 UTF-8 檔案與 YAML 檔頭。名稱須與資料夾一致。',
    editRaw: '編輯完整 SKILL.md', editFields: '編輯欄位', readOnlySkillHelp: '連結或無法讀取的檔案請從原生來源管理。',
    mcpNameHelp: '名稱對應 mcp.json 中的服務項目。',
    transportHelp: 'stdio 使用 command、args、env，HTTP(S) 使用 url、headers。timeout 單位為毫秒。',
    mcpJson: '服務設定（JSON）', mcpPatch: '變更內容（JSON）', savedFields: '已儲存欄位', masked: '已隱藏儲存值',
    unsupported: '無法辨識的設定', unsupportedHelp: '請查閱原生檔案以編輯此服務格式。',
    edit: '編輯', view: '檢視', cancel: '取消', close: '關閉', discard: '捨棄未儲存的編輯？',
    duplicate: '此名稱已存在，請編輯現有項目。', loading: '正在讀取…',
    runtime: '執行環境', cliFound: 'CLI 可用', cliMissing: 'CLI 無法使用', manage: '開啟 Agent 管理',
    login: '終端機登入指令', globalSettings: 'Global 設定', scope: '來源與作用範圍',
    configJson: 'Junie 設定（JSON）', examples: '檢視設定範例', docs: 'Junie 設定文件',
    fallback: '移除支援的欄位後，由 Junie 預設行為或其他原生設定來源決定。',
    extra: '憑證、自訂模型檔、settings.json、專案授權和額外來源由原生 CLI 管理。',
    precedence: '啟動參數和受信任專案的設定可以覆寫使用者預設值。',
  },
}

function el(tag, value = '', className = '') {
  const element = document.createElement(tag)
  element.textContent = value
  if (className) element.className = className
  return element
}

function button(text, click, className = '') {
  const element = el('button', text, className)
  element.type = 'button'
  element.onclick = click
  return element
}

function surface(element, kind) {
  element.dataset.themeSurface = kind
  return element
}

function bindTheme(root, ctx) {
  const paint = document.createElement('canvas').getContext('2d')
  if (!paint) { root.style.setProperty('--ju-on-accent', '#fff'); return }
  const update = () => {
    paint.fillStyle = 'CanvasText'
    paint.fillStyle = getComputedStyle(root).getPropertyValue('--accent-primary').trim() || 'CanvasText'
    paint.fillRect(0, 0, 1, 1)
    const channels = Array.from(paint.getImageData(0, 0, 1, 1).data.slice(0, 3), component => {
      const value = component / 255
      return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4
    })
    const luminance = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722
    root.style.setProperty('--ju-on-accent', luminance >= .179 ? '#000' : '#fff')
  }
  update()
  const observer = new MutationObserver(update)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] })
  ctx.lifecycle.add(() => observer.disconnect())
}

function titleFor(ctx, root) {
  return ctx.plugin.i18n?.[root.lang]?.views?.[ctx.view] ?? ctx.plugin.views.find(view => view.id === ctx.view).title
}

function message(initial = '') {
  const text = el('p', initial, 'ju-message')
  text.setAttribute('role', 'status')
  return text
}

function setMessage(node, text, error = false) {
  node.setAttribute('role', error ? 'alert' : 'status')
  node.textContent = text
}

function field(parent, type, caption, help, options = {}) {
  const label = el('label', '', 'ju-field')
  const input = surface(el(type), 'input')
  Object.assign(input, { spellcheck: false, ...options })
  input.setAttribute('aria-label', caption)
  const note = el('p', help)
  label.append(el('strong', caption), input, note)
  parent.append(label)
  return { input, label, note }
}

function link(caption, url) {
  const element = el('a', caption)
  element.href = url
  element.target = '_blank'
  element.rel = 'noopener noreferrer'
  return element
}

function jsonObject(input) {
  try {
    const value = JSON.parse(input)
    if (value && typeof value === 'object' && !Array.isArray(value)) return
  } catch { /* A JSON parse error can include user-entered secrets. */ }
  throw new Error('Expected a valid JSON object.')
}

async function mountConfiguration(root, ctx, t, labels, loginCopy) {
  const [, saveText, , reloadText, , , savedText, , scopeText, , , , configHelp, disabledText] = labels
  const [explainLogin, missingLogin, loginUnavailable] = loginCopy
  const page = el('section', '', 'ju-settings')
  const heading = el('header', '', 'ju-page-header')
  const actions = el('div', '', 'ju-actions')
  const save = button(saveText, saveConfig, 'primary'), reload = button(reloadText, reloadConfig)
  actions.append(save, reload)
  heading.append(el('h1', titleFor(ctx, root)), actions)
  const status = message(t.loading), body = el('div', '', 'ju-page-content')
  const grid = el('div', '', 'ju-settings-grid')
  const runtime = surface(el('section', '', 'ju-section ju-runtime'), 'card')
  const runtimeHeading = el('div', '', 'ju-runtime-heading'), cli = el('p', t.loading)
  const loginDetails = el('details'), command = el('code', '', 'ju-source-path'), loginHint = el('p')
  loginDetails.append(el('summary', t.login), command)
  runtimeHeading.append(el('h2', t.runtime), cli, button(t.manage, () => ctx.ui.navigate('/studio/agents')))
  runtime.append(runtimeHeading, loginHint, loginDetails)
  const global = surface(el('section', '', 'ju-section'), 'card')
  global.append(el('h2', t.globalSettings))
  const config = field(global, 'textarea', t.configJson, configHelp, { rows: 10, dir: 'ltr' }).input
  const path = el('code', '', 'ju-source-path'), example = el('details')
  const template = { 'skill-default-locations': true, 'mcp-default-locations': true }
  example.append(el('summary', t.examples), el('pre', JSON.stringify(template, null, 2)))
  global.append(path, example)
  const sources = surface(el('section', '', 'ju-section'), 'card')
  const unavailable = el('p')
  sources.append(el('h2', t.scope), el('p', scopeText), el('p', t.sameHome), el('p', t.precedence),
    el('p', t.fallback), el('p', t.extra), unavailable, link(t.docs, 'https://junie.jetbrains.com/docs/junie-cli-configuration.html'))
  grid.append(runtime, global, sources)
  body.append(status, grid)
  page.append(heading, body)
  root.append(page)

  let active = true, busy = false, data = null, baseline = ''
  ctx.lifecycle.add(() => { active = false })
  function setBusy(value) {
    busy = value
    page.setAttribute('aria-busy', String(busy))
    save.disabled = busy || !data?.enabled
    reload.disabled = busy
    config.disabled = busy || !data
    config.readOnly = Boolean(data && !data.enabled)
  }
  async function operation(action) {
    if (!active || busy) return
    setBusy(true)
    setMessage(status, data ? '' : t.loading)
    try { await action() }
    catch (error) { if (active) setMessage(status, error.message, true) }
    finally { if (active) setBusy(false) }
  }
  function showConfig(value) {
    if (!active) return
    data = value
    config.value = value.content
    baseline = config.value
    path.textContent = value.path
    unavailable.textContent = value.enabled ? '' : disabledText
    unavailable.hidden = value.enabled
    setMessage(status, '')
  }
  function reloadConfig() {
    return operation(async () => {
      if (data && config.value !== baseline && !await ctx.ui.confirm(t.discard)) return
      showConfig(await ctx.rpc.call('native-config-read'))
    })
  }
  function saveConfig() {
    return operation(async () => {
      if (!data?.enabled) return
      jsonObject(config.value)
      showConfig(await ctx.rpc.call('native-config-write', { revision: data.revision, content: config.value }))
      if (active) { setMessage(status, savedText); ctx.ui.notify(savedText, 'success') }
    })
  }
  loginDetails.hidden = true
  const loadLogin = ctx.rpc.call('native-login').then(result => {
    if (!active) return
    cli.textContent = result.command ? t.cliFound : t.cliMissing
    loginHint.textContent = result.command ? explainLogin : missingLogin
    command.textContent = result.command
    loginDetails.hidden = !result.command
  }, () => {
    if (active) { cli.textContent = t.cliMissing; loginHint.textContent = loginUnavailable }
  })
  await Promise.all([reloadConfig(), loadLogin])
}

async function mountResources(root, ctx, t, labels) {
  const [, saveText, removeText, reloadText, nameText, chooseText, savedText, confirmText, scopeText,
    , skillHelp, mcpHelp, , , readOnlyText] = labels
  const skills = ctx.view === 'skills'
  const title = titleFor(ctx, root)
  const page = el('section', '', skills ? 'ju-manager ju-skills' : 'ju-manager')
  const header = el('header', '', 'ju-page-header'), toolbar = el('div', '', 'ju-toolbar'), actions = el('div', '', 'ju-buttons')
  const add = button(skills ? t.addSkill : t.addMcp, () => openEditor(), 'primary')
  const refresh = button(reloadText, () => operation(load), 'quiet')
  const search = surface(el('input'), 'input')
  search.type = 'search'
  search.placeholder = skills ? t.searchSkill : t.searchMcp
  search.setAttribute('aria-label', search.placeholder)
  toolbar.append(search)
  actions.append(refresh)
  if (skills) actions.append(add)
  else toolbar.append(add)
  header.append(el('h1', title))
  if (skills) header.append(toolbar)
  header.append(actions)

  const body = el('div', '', 'ju-page-content'), list = el('div', '', 'ju-items')
  const status = message(t.loading), path = el('code', '', 'ju-source-path')
  const source = el('details', '', 'ju-source-info'), discovery = el('p', '', 'ju-note')
  const resourceHelp = skills ? t.enabledHelp : t.connectionsHelp
  source.append(el('summary', t.sources), el('p', scopeText), path, el('p', t.scopeHelp))
  const detail = el('section', '', 'ju-skill-detail')
  detail.setAttribute('aria-label', t.body)
  const stats = el('div', '', 'ju-stats'), counts = []
  if (skills) {
    const layout = el('div', '', 'ju-skills-layout'), sidebar = el('aside', '', 'ju-skills-sidebar')
    sidebar.setAttribute('aria-label', t.skills)
    source.append(el('p', resourceHelp))
    source.insertBefore(discovery, path)
    sidebar.append(status, list, source)
    layout.append(sidebar, detail)
    body.append(layout)
  } else {
    for (const label of [t.total, 'stdio', 'HTTP(S)']) {
      const count = el('strong', '0')
      const stat = surface(el('div', '', 'ju-stat'), 'card')
      stat.append(el('span', label), count)
      stats.append(stat)
      counts.push(count)
    }
    body.append(el('p', scopeText), status, stats, toolbar, discovery, el('p', resourceHelp, 'ju-note'), source, list)
  }

  const dialog = el('dialog', '', 'ju-dialog')
  const editor = el('form', '', 'ju-editor'), viewPanel = el('section', '', 'ju-editor')
  const formHeader = el('h2'), fields = el('fieldset'), editorStatus = message()
  const formActions = el('div', '', 'ju-buttons')
  const name = field(fields, 'input', nameText, skills ? t.nameHelp : t.mcpNameHelp, { required: true, maxLength: skills ? 64 : 128, dir: 'ltr' }).input
  const description = skills ? field(fields, 'textarea', t.description, t.descriptionHelp, { rows: 2 }) : null
  if (description) description.input.style.minHeight = '0'
  const content = field(fields, 'textarea', skills ? t.body : t.mcpJson, '', { rows: 9, dir: 'ltr' })
  const toggleFormat = skills ? button(t.editRaw, switchFormat, 'quiet') : null
  const cancel = button(t.cancel, cancelEdit), save = button(saveText, saveResource, 'primary')
  if (toggleFormat) formActions.append(toggleFormat)
  formActions.append(cancel, save)
  editor.append(formHeader, fields, editorStatus, formActions)
  dialog.append(editor, viewPanel)
  page.append(header, body, dialog)
  root.append(page)

  let active = true, busy = false, data = null, selected = '', previewRequest = 0, edit = null, baseline = ''
  const documents = new Map()
  ctx.lifecycle.add(() => { active = false; dialog.close() })
  const discoveryLabel = () => data?.discovery === 'enabled' ? t.on : data?.discovery === 'disabled' ? t.off : t.unknown
  const focusButton = (selector) => page.querySelector(selector)?.focus()
  function setBusy(value) {
    busy = value
    page.setAttribute('aria-busy', String(value))
    add.disabled = value || !data
    search.disabled = value || !data
    refresh.disabled = value
    fields.disabled = value
    save.disabled = value
    cancel.disabled = value
    if (toggleFormat) toggleFormat.disabled = value
    for (const control of [...list.querySelectorAll('button'), ...detail.querySelectorAll('button')]) {
      control.disabled = value || control.dataset.readOnly === 'true'
    }
  }
  async function operation(action) {
    if (!active || busy) return
    setBusy(true)
    setMessage(dialog.open ? editorStatus : status, data ? '' : t.loading)
    try { await action() }
    catch (error) { if (active) setMessage(dialog.open ? editorStatus : status, error.message, true) }
    finally { if (active) setBusy(false) }
  }
  async function load() {
    const value = await ctx.rpc.call(skills ? 'native-skills-list' : 'native-mcp-list')
    if (!active) return
    data = value
    documents.clear()
    path.textContent = data.path
    discovery.textContent = discoveryLabel()
    if (!skills) {
      counts[0].textContent = String(data.entries.length)
      counts[1].textContent = String(data.entries.filter(entry => entry.transport === 'stdio').length)
      counts[2].textContent = String(data.entries.filter(entry => entry.transport === 'http').length)
    }
    setMessage(status, '')
    render()
  }
  function getSkill(name) {
    if (!documents.has(name)) documents.set(name, ctx.rpc.call('native-skill-read', { name }).then(value => {
      if (value.revision === 'missing') throw new Error('Skill file is missing. Reload the list.')
      return value
    }).catch(error => { documents.delete(name); throw error }))
    return documents.get(name)
  }

  function identifiedButton(text, item, click, className) {
    const result = button(text, click, className)
    result.setAttribute('aria-label', text + ' ' + item.name)
    return result
  }
  function resourceActions(item) {
    const box = el('div', '', 'ju-buttons')
    if (!skills) box.append(identifiedButton(t.view, item, () => viewMcp(item), 'quiet'))
    const editButton = identifiedButton(t.edit, item, () => openEditor(item), 'quiet')
    const removeButton = identifiedButton(removeText, item, () => remove(item), 'quiet danger')
    if (!item.editable) editButton.dataset.readOnly = 'true'
    if (skills && !item.editable) removeButton.dataset.readOnly = 'true'
    for (const control of [editButton, removeButton]) control.disabled = control.dataset.readOnly === 'true'
    box.append(editButton, removeButton)
    return box
  }

  function mcpSwitch(item) {
    const toggle = identifiedButton(item.enabled ? t.disable : t.enable, item, () => operation(async () => {
      await ctx.rpc.call('native-mcp-write', {
        name: item.name, revision: data.revision, patch: JSON.stringify({ enabled: !item.enabled }),
      })
      if (!active) return
      await load()
      if (active) {
        setMessage(status, savedText)
        ctx.ui.notify(savedText, 'success')
        // Rebuilding cards should keep focus on the corresponding switch.
        const next = [...list.querySelectorAll('.ju-switch')].find(control => control.dataset.resource === item.name)
        requestAnimationFrame(() => { if (active) next?.focus() })
      }
    }), 'ju-switch')
    toggle.textContent = ''
    toggle.setAttribute('role', 'switch')
    toggle.setAttribute('aria-checked', String(item.enabled))
    toggle.dataset.resource = item.name
    return toggle
  }

  function showSkill(item) {
    const request = ++previewRequest
    detail.replaceChildren()
    if (!item) { detail.append(el('p', chooseText, 'ju-empty')); return }
    const top = el('div', '', 'ju-detail-heading')
    const back = button(t.skills, () => {
      page.classList.remove('ju-show-detail')
      focusButton('.ju-skill-select[aria-pressed=true]')
    }, 'ju-back quiet')
    top.append(back, el('h2', item.name), resourceActions(item))
    const previewHeading = el('div', '', 'ju-preview-line')
    previewHeading.append(el('span', t.local, 'ju-badge'), el('span', discoveryLabel(), 'ju-badge'))
    detail.append(top, previewHeading, el('p', scopeText, 'ju-note'))
    if (item.description) detail.append(el('p', item.description))
    const separator = /^(?:[a-z]:)?\\/i.test(data.path) ? '\\' : '/'
    const filename = [data.path, item.name, 'SKILL.md'].join(separator)
    detail.append(el('code', filename, 'ju-source-path'))
    if (!item.editable) {
      detail.append(el('p', readOnlyText + '. ' + t.readOnlySkillHelp))
      return
    }
    const preview = el('pre', t.loading, 'ju-document')
    detail.append(el('div', 'SKILL.md', 'ju-file-heading'), preview, el('p', resourceHelp, 'ju-note'))
    void getSkill(item.name).then(value => {
      if (active && request === previewRequest) preview.textContent = value.body ?? value.markdown
    }, error => {
      if (active && request === previewRequest) { preview.textContent = error.message; preview.setAttribute('role', 'alert') }
    })
  }

  function transport(item) {
    return item.transport === 'http' ? 'HTTP(S)' : item.transport === 'stdio' ? 'stdio' : t.unsupported
  }

  function render() {
    if (!data) return
    list.replaceChildren()
    const query = search.value.trim().toLocaleLowerCase()
    const matches = data.entries.filter(item => {
      const { command, args, url } = item.preview ?? {}
      return [item.name, item.description, item.transport, command, url, ...(args ?? [])]
        .filter(Boolean).join(' ').toLocaleLowerCase().includes(query)
    })
    if (!matches.length) {
      list.append(el('p', data.entries.length ? t.noMatches : skills ? t.emptySkills : t.emptyMcp, 'ju-empty'))
      if (skills) { page.classList.remove('ju-show-detail'); showSkill(null) }
      return
    }
    if (skills) {
      if (!matches.some(item => item.name === selected)) selected = matches[0].name
      list.append(el('h2', t.local + ' · ' + matches.length, 'ju-skill-group'))
      for (const item of matches) {
        const summary = el('span', '', 'ju-summary')
        summary.append(el('strong', item.name))
        if (item.description) summary.append(el('small', item.description))
        const row = button('', () => {
          selected = item.name
          page.classList.add('ju-show-detail')
          render()
          focusButton(matchMedia('(max-width:768px)').matches ? '.ju-back' : '.ju-skill-select[aria-pressed=true]')
        }, 'ju-skill-select')
        row.append(summary)
        if (!item.editable) row.append(el('span', readOnlyText, 'ju-badge'))
        row.setAttribute('aria-label', item.name)
        row.setAttribute('aria-pressed', String(item.name === selected))
        list.append(row)
      }
      showSkill(matches.find(item => item.name === selected))
      return
    }
    for (const item of matches) {
      const card = surface(el('article', '', 'ju-row'), 'card')
      const heading = el('div', '', 'ju-row-heading'), badges = el('div', '', 'ju-badges')
      badges.append(el('span', transport(item), 'ju-badge'), el('span', t.local, 'ju-badge'))
      if (item.enabled !== undefined) {
        badges.append(el('span', item.enabled ? t.configuredOn : t.configuredOff, `ju-badge${item.enabled ? ' active' : ''}`))
      }
      heading.append(el('strong', item.name), badges)
      const summary = el('div', '', 'ju-summary')
      const { command, url, args, remainingArgs } = item.preview
      const launch = command && [command, ...(args ?? []).map(value => value || '…'), ...(remainingArgs ? ['…'] : [])].join(' ')
      const preview = launch || url
      summary.append(heading)
      if (preview) summary.append(el('code', preview, 'ju-source-path'))
      else summary.append(el('p', item.fields.length ? item.fields.join(' · ') : t.unsupported))
      if (item.timeout !== undefined) summary.append(el('p', item.timeout + ' ms'))
      if (!item.editable) summary.append(el('p', t.unsupportedHelp))
      const footer = el('div', '', 'ju-row-footer')
      footer.append(resourceActions(item))
      if (item.enabled !== undefined) footer.append(mcpSwitch(item))
      card.append(summary, footer)
      list.append(card)
    }
  }

  function showFields(item) {
    const saved = el('div', '', 'ju-summary')
    saved.append(el('p', t.savedFields))
    const { command, args, url, remainingArgs } = item.preview
    const values = { command, args: args?.map(value => value || t.masked), url, timeout: item.timeout, enabled: item.enabled }
    const redacted = Object.fromEntries(item.fields.map(key => [key, values[key] ?? t.masked]))
    saved.append(el('pre', JSON.stringify(redacted, null, 2), 'ju-document'), el('p', t.previewHelp, 'ju-note'))
    if (remainingArgs) saved.append(el('p', t.moreArgs + ' (' + remainingArgs + ')', 'ju-note'))
    return saved
  }

  function switchPanel(panel, subtitle) {
    editor.hidden = panel !== editor
    viewPanel.hidden = panel !== viewPanel
    dialog.setAttribute('aria-label', subtitle)
    if (!dialog.open) dialog.showModal()
  }
  function viewMcp(item) {
    const heading = el('h2', item.name), footer = el('div', '', 'ju-buttons')
    footer.append(button(t.close, () => dialog.close()))
    viewPanel.replaceChildren(heading, el('p', transport(item) + ' · ' + t.local),
      showFields(item), el('p', resourceHelp), footer)
    switchPanel(viewPanel, item.name)
  }

  const formState = () => JSON.stringify([name.value, description?.input.value, content.input.value])
  function fillSkill() {
    const { original, raw } = edit
    description.label.hidden = raw
    const template = '---\nname: ' + name.value + '\ndescription: \n---\n'
    content.input.value = raw ? original?.markdown ?? template : original?.body ?? ''
    description.input.value = original?.description ?? ''
    const caption = raw ? 'SKILL.md' : t.body
    content.label.firstElementChild.textContent = caption
    content.input.setAttribute('aria-label', caption)
    content.note.textContent = raw ? t.rawHelp : t.bodyHelp
    toggleFormat.textContent = raw ? t.editFields : t.editRaw
    toggleFormat.hidden = Boolean(original && original.body === undefined)
    baseline = formState()
  }
  function switchFormat() {
    return operation(async () => {
      if (!edit || (formState() !== baseline && !await ctx.ui.confirm(t.discard)) || !active) return
      edit.raw = !edit.raw
      fillSkill()
    }).then(() => { if (active && dialog.open) content.input.focus() })
  }
  function openEditor(item) {
    return operation(async () => {
      const original = skills && item ? await getSkill(item.name) : null
      if (!active) return
      const subtitle = item ? t.edit + ' ' + item.name : skills ? t.addSkill : t.addMcp
      edit = { item, original, revision: skills ? original?.revision ?? 'missing' : data.revision,
        raw: Boolean(skills && original && original.body === undefined) }
      name.value = item?.name ?? ''
      name.readOnly = Boolean(item)
      formHeader.textContent = subtitle + ' · ' + t.local
      if (skills) fillSkill()
      else {
        const caption = item ? t.mcpPatch : t.mcpJson
        content.label.firstElementChild.textContent = caption
        content.input.setAttribute('aria-label', caption)
        content.input.value = item ? '{}' : '{\n  "command": "",\n  "args": []\n}'
        content.note.textContent = item ? mcpHelp + ' ' + t.transportHelp : t.transportHelp
        fields.querySelector('.ju-saved-fields')?.remove()
        if (item) {
          const summary = showFields(item)
          summary.classList.add('ju-saved-fields')
          fields.insertBefore(summary, content.label)
        }
        baseline = formState()
      }
      setMessage(editorStatus, '')
      switchPanel(editor, subtitle)
    }).then(() => {
      if (active && dialog.open && !editor.hidden) (item ? content.input : name).focus()
    })
  }
  function cancelEdit() {
    return operation(async () => {
      if (edit && formState() !== baseline && !await ctx.ui.confirm(t.discard)) return
      if (active) dialog.close()
    })
  }
  dialog.onclose = () => { edit = null }
  dialog.oncancel = event => {
    if (!editor.hidden) { event.preventDefault(); void cancelEdit() }
  }
  function saveResource(event) {
    event?.preventDefault()
    if (busy || !edit || !editor.reportValidity()) return
    const current = edit
    void operation(async () => {
      const key = name.value.trim()
      if (!current.item && data.entries.some(item => item.name === key)) throw new Error(t.duplicate)
      const input = { name: key, revision: current.revision }
      if (skills) {
        if (current.raw) input.markdown = content.input.value
        else Object.assign(input, { description: description.input.value, body: content.input.value })
      } else {
        jsonObject(content.input.value)
        input.patch = content.input.value
      }
      await ctx.rpc.call(skills ? 'native-skill-write' : 'native-mcp-write', input)
      if (!active) return
      if (!current.item) search.value = ''
      selected = key
      dialog.close()
      await load()
      if (active) { setMessage(status, savedText); ctx.ui.notify(savedText, 'success') }
    })
  }
  function remove(item) {
    return operation(async () => {
      const hint = skills ? ' ' + skillHelp : ''
      if (!await ctx.ui.confirm(confirmText + ' (' + item.name + ')' + hint) || !active) return
      const revision = skills ? (await getSkill(item.name)).revision : data.revision
      if (!active) return
      await ctx.rpc.call(skills ? 'native-skill-remove' : 'native-mcp-remove', { name: item.name, revision })
      if (!active) return
      if (skills) page.classList.remove('ju-show-detail')
      await load()
      if (active) { setMessage(status, savedText); ctx.ui.notify(savedText, 'success') }
    })
  }

  search.oninput = render
  editor.onsubmit = saveResource
  editor.onkeydown = event => {
    if (event.key === 'Enter' && !event.isComposing && event.target === name) saveResource(event)
  }
  await operation(load)
}
