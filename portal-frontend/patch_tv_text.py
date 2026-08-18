import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

# 1. State
state_orig = r"portalSubtitle: 'Hotel Sukumvit',\n    guestServicesEnabled: \{ services: true, dining: true, localGuide: true \}"
state_new = """portalSubtitle: 'Hotel Sukumvit',
    portalWelcomeText: 'WELCOME TO',
    marqueeMessage: 'Welcome to S31 Hotel Sukhumvit! Experience our new Ice Bath & Sauna facilities on the wellness floor today. ❄️ | Join our special Happy Hour at the Bar from 5 PM to 7 PM. 🍸',
    guestServicesEnabled: { services: true, dining: true, localGuide: true }"""
content = re.sub(state_orig, state_new, content)

# 2. fetchSettings
fetch_orig = r"portalSubtitle: data\.portal_subtitle \|\| 'Hotel Sukumvit',\n          guestServicesEnabled: data\.guestServicesEnabled \|\| \{ services: true, dining: true, localGuide: true \}"
fetch_new = """portalSubtitle: data.portal_subtitle || 'Hotel Sukumvit',
          portalWelcomeText: data.portal_welcome_text || 'WELCOME TO',
          marqueeMessage: data.marquee_message || 'Welcome to S31 Hotel Sukhumvit! Experience our new Ice Bath & Sauna facilities on the wellness floor today. ❄️ | Join our special Happy Hour at the Bar from 5 PM to 7 PM. 🍸',
          guestServicesEnabled: data.guestServicesEnabled || { services: true, dining: true, localGuide: true }"""
content = re.sub(fetch_orig, fetch_new, content)

# 3. Marquee text (default state)
content = content.replace(
    "message: 'Welcome to S31 Hotel Sukhumvit! Experience our new Ice Bath & Sauna facilities on the wellness floor today. ❄️ | Join our special Happy Hour at the Bar from 5 PM to 7 PM. 🍸',",
    "message: 'Welcome to S31 Hotel Sukhumvit! Experience our new Ice Bath & Sauna facilities on the wellness floor today. ❄️ | Join our special Happy Hour at the Bar from 5 PM to 7 PM. 🍸', // replaced dynamically"
)

# 4. Marquee hide/show overrides in socket events
marquee_orig_1 = r"setMarquee\(\{ message: 'Welcome to S31 Hotel Sukhumvit! Experience our new Ice Bath & Sauna facilities on the wellness floor today\. ❄️ \| Join our special Happy Hour at the Bar from 5 PM to 7 PM\. 🍸', type: 'default' \}\);"
marquee_new_1 = "setMarquee({ message: appSettings.marqueeMessage || 'Welcome to S31 Hotel Sukhumvit!', type: 'default' });"
content = re.sub(marquee_orig_1, marquee_new_1, content)

# 5. Welcome texts
welcome_to_orig = r"\{guestData\.isCheckedIn \? 'WELCOME' : 'WELCOME TO'\}"
welcome_to_new = "{guestData.isCheckedIn ? 'WELCOME' : (appSettings.portalWelcomeText || 'WELCOME TO')}"
content = content.replace(welcome_to_orig, welcome_to_new)

sukumvit_orig = r"\{guestData\.isCheckedIn && guestData\.name \? guestData\.name : `\$\{appSettings\.portalMainTitle \|\| 'S31'\} Sukumvit`\}"
sukumvit_new = "{guestData.isCheckedIn && guestData.name ? guestData.name : `${appSettings.portalMainTitle || 'S31'} ${appSettings.portalSubtitle || 'Sukumvit'}`}"
content = content.replace(sukumvit_orig, sukumvit_new)

with open('src/App.tsx', 'w') as f:
    f.write(content)

