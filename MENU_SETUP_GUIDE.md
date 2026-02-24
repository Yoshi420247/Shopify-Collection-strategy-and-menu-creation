# Menu Setup Guide

AUTOMATED MENU TOOLS (recommended):
────────────────────────────────────
  npm run menu:nav              # Full inspection report
  npm run menu:nav:validate     # Verify config vs store
  npm run menu:auto             # Preview menu changes (dry run)
  npm run menu:auto:execute     # Apply all menus to Shopify

MANUAL SETUP (if automated tools unavailable):
───────────────────────────────────────────────
Go to Shopify Admin → Online Store → Navigation:

1. MAIN MENU (handle: main-menu):
   • Shop All → /collections/all
   • Smoke & Vape → /collections/smoke-and-vape
     ├── Bongs & Water Pipes → /collections/bongs-water-pipes
     ├── Dab Rigs → /collections/dab-rigs
     ├── Hand Pipes → /collections/hand-pipes
     ├── Bubblers → /collections/bubblers
     ├── Nectar Collectors → /collections/nectar-collectors
     ├── One Hitters & Chillums → /collections/one-hitters-chillums
     ├── Steamrollers → /collections/steamrollers
     ├── Silicone Pieces → /collections/silicone-rigs-bongs
     ├── Vapes & Electronics → /collections/vapes-electronics
     └── Shop All Smoke & Vape → /collections/smoke-and-vape
   • Accessories → /collections/accessories
     ├── Quartz Bangers → /collections/quartz-bangers
     ├── Carb Caps → /collections/carb-caps
     ├── Dab Tools → /collections/dab-tools
     ├── Flower Bowls → /collections/flower-bowls
     ├── Ash Catchers → /collections/ash-catchers
     ├── Adapters & Drop Downs → /collections/adapters
     ├── Ashtrays → /collections/ashtrays
     ├── Torches → /collections/torches
     ├── Grinders → /collections/grinders
     └── Rolling Papers & Cones → /collections/rolling-papers-cones
   • Extraction & Packaging → /collections/extraction-packaging
   • Brands → # (dropdown with all brand collections)
     ├── RAW, Zig Zag, Vibes, Elements, Cookies, Monark, Maven
     ├── Puffco, Lookah, G Pen, 710 SCI, Scorch
     └── Peaselburg, Only Quartz, EO Vape
   • Featured → # (dropdown)
     ├── Heady Glass, Made In USA, Travel Friendly
     ├── Pendants & Merch, Glass Pendants
     └── Gifts, Clearance

2. FIX BROKEN MENU LINKS:
   ───────────────────────
   • rolling-papers → rolling-papers-cones (canonical collection)
   • Any 404s should be updated to the collections above.

3. MEGA MENU (optional):
   In Theme Customizer → Header → Mega Menus:
   • Enable and configure columns with sub-menus
