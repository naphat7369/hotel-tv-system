import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

# 1. MenuItem Interface
content = content.replace(
    "bgImage?: string\n}",
    "bgImage?: string\n  enabled?: boolean\n}"
)

# 2. appSettings State
app_settings_orig = "portalSubtitle: 'Hotel Sukumvit'\n  })"
app_settings_new = "portalSubtitle: 'Hotel Sukumvit',\n    guestServicesEnabled: { services: true, dining: true, localGuide: true }\n  })"
content = content.replace(app_settings_orig, app_settings_new)

# 3. fetchSettings
fetch_settings_orig = "portalSubtitle: data.portal_subtitle || 'Hotel Sukumvit'\n        });"
fetch_settings_new = "portalSubtitle: data.portal_subtitle || 'Hotel Sukumvit',\n          guestServicesEnabled: data.guestServicesEnabled || { services: true, dining: true, localGuide: true }\n        });"
content = content.replace(fetch_settings_orig, fetch_settings_new)

# 4. fetchMenuItems
fetch_menu_items_orig = "bgImage: item.bgImage,\n        });"
fetch_menu_items_new = "bgImage: item.bgImage,\n          enabled: item.enabled !== false,\n        });"
content = content.replace(fetch_menu_items_orig, fetch_menu_items_new)

# 5. renderSubMenuHorizontalCards
render_cards_orig = r'className="flex-shrink-0 w-\[24vw\] h-\[35vh\] rounded-\[24px\] overflow-hidden relative group border-2 border-transparent transition-all duration-300 hover:scale-\[1\.02\] glow-focus outline-none bg-gradient-to-br from-slate-800 to-slate-900".*?bgImage\.startsWith\(\'http\'\) \? item\.bgImage : `http://\$\{window\.location\.hostname\}:3000\$\{item\.bgImage\}`\} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity duration-300".*?</div>\s*<div>\s*<span className={`inline-block px-\[0\.8vw\] py-\[0\.4vh\] text-\[0\.7vw\] font-bold rounded-full tracking-widest flex items-center gap-1 w-fit border bg-black/50 backdrop-blur-md \$\{typeStyles\}`}>\s*<span className="material-symbols-outlined" style=\{\{ fontSize: \'1vw\' \}\}>\{iconName\}</span> \{item\.displayType\.replace\(\'_\', \' \'\)\}\s*</span>\s*</div>\s*<div className="transform translate-y-\[1vh\] group-hover:translate-y-0 transition-transform duration-300">\s*<h3 className="font-display-lg text-\[2\.5vw\] leading-tight mb-\[0\.5vh\] text-white drop-shadow-lg">\{item\.name\}</h3>\s*\{item\.subtitle && <p className="text-on-surface-variant text-\[1vw\] line-clamp-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">\{item\.subtitle\}</p>\}\s*</div>'

def render_cards_replace(match):
    return """className={`flex-shrink-0 w-[24vw] h-[35vh] rounded-[24px] overflow-hidden relative group border-2 transition-all duration-300 outline-none ${item.enabled === false ? 'border-transparent grayscale opacity-60' : 'border-transparent hover:scale-[1.02] glow-focus bg-gradient-to-br from-slate-800 to-slate-900'}`}
          >
            {item.bgImage && (
              <img src={item.bgImage.startsWith('http') ? item.bgImage : `http://${window.location.hostname}:3000${item.bgImage}`} alt="" className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${item.enabled === false ? 'opacity-80' : 'opacity-60 group-hover:opacity-100'}`} />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-black/10 flex flex-col justify-between p-[1.5vw] text-left">
              <div className="flex justify-between items-start">
                <span className={`inline-block px-[0.8vw] py-[0.4vh] text-[0.7vw] font-bold rounded-full tracking-widest flex items-center gap-1 w-fit border bg-black/50 backdrop-blur-md ${typeStyles}`}>
                  <span className="material-symbols-outlined" style={{ fontSize: '1vw' }}>{iconName}</span> {item.displayType.replace('_', ' ')}
                </span>
                {item.enabled === false && (
                  <span className="bg-red-600/90 text-white text-[0.8vw] font-bold px-[0.8vw] py-[0.3vh] rounded shadow-md uppercase tracking-wide">
                    ไม่พร้อมให้บริการ
                  </span>
                )}
              </div>
              <div className={`transform transition-transform duration-300 ${item.enabled === false ? '' : 'translate-y-[1vh] group-hover:translate-y-0'}`}>
                <h3 className="font-display-lg text-[2.5vw] leading-tight mb-[0.5vh] text-white drop-shadow-lg">{item.name}</h3>
                {item.subtitle && <p className={`text-on-surface-variant text-[1vw] line-clamp-2 transition-opacity duration-300 ${item.enabled === false ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>{item.subtitle}</p>}
              </div>"""

content = re.sub(render_cards_orig, render_cards_replace, content, flags=re.DOTALL)

# Also update the onClick in renderSubMenuHorizontalCards
onclick_orig = r'onClick=\{\(\) => \{\s*setSelectedItem\(item\);\s*trackEvent\(\'ITEM_VIEW\', \{ itemId: item\.id, name: item\.name \}\);\s*\}\}'
onclick_new = """onClick={() => {
              if (item.enabled === false) {
                setAlertModal({ active: true, message: 'บริการนี้ปิดชั่วคราว (Service temporarily unavailable)' });
                return;
              }
              setSelectedItem(item);
              trackEvent('ITEM_VIEW', { itemId: item.id, name: item.name });
            }}"""
content = re.sub(onclick_orig, onclick_new, content)

# 6. Maintenance screen logic
maintenance_orig = r'(// --- HORIZONTAL LAYOUT ---\s*<div className="flex flex-col flex-1 min-h-0">\s*)(<div className="mb-\[4vh\] flex-none">)'
maintenance_new = r"""\1{((activeMenu === 'Services' && !appSettings.guestServicesEnabled.services) ||
                  (activeMenu === 'Dining' && !appSettings.guestServicesEnabled.dining) ||
                  (activeMenu === 'Local Guide' && !appSettings.guestServicesEnabled.localGuide)) ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <span className="material-symbols-outlined text-[8vw] text-white/50 mb-4">build</span>
                    <h2 className="text-[3vw] font-bold text-white mb-2">กำลังปรับปรุงระบบ</h2>
                    <p className="text-[1.5vw] text-white/70">ขออภัยในความไม่สะดวก หมวดหมู่นี้ปิดปรับปรุงชั่วคราว</p>
                  </div>
                ) : (
                  <>
                    \2"""
content = re.sub(maintenance_orig, maintenance_new, content)

# Close the fragment for the maintenance screen
end_div_orig = r'(<div className="flex gap-\[2vw\] overflow-x-auto no-scrollbar pb-\[5vh\] items-stretch flex-1">.*?</div>\s*)(</div>)'
end_div_new = r'\1</>\n                )}\n                \2'
content = re.sub(end_div_orig, end_div_new, content, flags=re.DOTALL)


with open('src/App.tsx', 'w') as f:
    f.write(content)
