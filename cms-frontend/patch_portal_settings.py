import re

with open('src/pages/settings/PortalSettings.tsx', 'r') as f:
    content = f.read()

# 1. State
state_orig = r"const \[portalSubtitle, setPortalSubtitle\] = useState\('Concierge'\);"
state_new = """const [portalSubtitle, setPortalSubtitle] = useState('Concierge');
  const [portalWelcomeText, setPortalWelcomeText] = useState('WELCOME TO');
  const [marqueeMessage, setMarqueeMessage] = useState('Welcome to S31 Hotel Sukhumvit! Experience our new Ice Bath & Sauna facilities on the wellness floor today. ❄️ | Join our special Happy Hour at the Bar from 5 PM to 7 PM. 🍸');"""
content = re.sub(state_orig, state_new, content)

# 2. fetchSettings
fetch_orig = r"setPortalSubtitle\(data\.portal_subtitle || 'Concierge'\);"
fetch_new = """setPortalSubtitle(data.portal_subtitle || 'Concierge');
      setPortalWelcomeText(data.portal_welcome_text || 'WELCOME TO');
      setMarqueeMessage(data.marquee_message || 'Welcome to S31 Hotel Sukhumvit! Experience our new Ice Bath & Sauna facilities on the wellness floor today. ❄️ | Join our special Happy Hour at the Bar from 5 PM to 7 PM. 🍸');"""
content = re.sub(fetch_orig, fetch_new, content)

# 3. handleSave
save_orig = r"formData\.append\('portal_subtitle', portalSubtitle\);"
save_new = """formData.append('portal_subtitle', portalSubtitle);
      formData.append('portal_welcome_text', portalWelcomeText);
      formData.append('marquee_message', marqueeMessage);"""
content = re.sub(save_orig, save_new, content)

# 4. UI
ui_orig = r'<div className="grid grid-cols-2 gap-6">'
ui_new = """<div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-sm font-medium text-on-surface-variant mb-2">Welcome Prefix</label>
            <input
              type="text"
              value={portalWelcomeText}
              onChange={e => setPortalWelcomeText(e.target.value)}
              className="w-full bg-surface border border-outline rounded-lg px-4 py-2.5 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
              placeholder="e.g. WELCOME TO"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-on-surface-variant mb-2">Marquee Text (Scrolling)</label>
            <input
              type="text"
              value={marqueeMessage}
              onChange={e => setMarqueeMessage(e.target.value)}
              className="w-full bg-surface border border-outline rounded-lg px-4 py-2.5 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
              placeholder="e.g. Welcome to..."
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-6">"""
content = content.replace(ui_orig, ui_new)

with open('src/pages/settings/PortalSettings.tsx', 'w') as f:
    f.write(content)

