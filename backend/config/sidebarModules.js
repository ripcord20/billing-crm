/**
 * Katalog modul sidebar kiri.
 * Satu entri = satu item menu yang bisa diaktifkan per role di
 * Pengaturan → Users & Roles → Hak Akses.
 *
 * name       : kunci permission di tabel permissions (unik)
 * display    : label di UI hak akses & sidebar
 * section    : grup di sidebar
 * href       : path halaman
 * prefixes   : path lain (termasuk API) yang ikut diizinkan jika modul aktif
 */
const SIDEBAR_MODULES = [
  // OVERVIEW
  { key: 'dashboard',          name: 'module.dashboard',          display: 'Dashboard',             section: 'OVERVIEW',    href: '/dashboard',                  prefixes: ['/dashboard'] },
  { key: 'finance',            name: 'module.finance',            display: 'Financial Dashboard',   section: 'OVERVIEW',    href: '/finance',                    prefixes: ['/finance'] },
  { key: 'noc',                name: 'module.noc',                display: 'NOC Dashboard',         section: 'OVERVIEW',    href: '/noc',                        prefixes: ['/noc'] },
  { key: 'sales',              name: 'module.sales',              display: 'Sales Dashboard',       section: 'OVERVIEW',    href: '/sales',                      prefixes: ['/sales'] },
  { key: 'tenants',            name: 'module.tenants',            display: 'Multi Tenant',          section: 'OVERVIEW',    href: '/tenants',                    prefixes: ['/tenants'] },
  { key: 'tenant',             name: 'module.tenant',             display: 'Dashboard Tenant',      section: 'OVERVIEW',    href: '/tenant',                     prefixes: ['/tenant'] },

  // MONITORING
  { key: 'nms',                name: 'module.nms',                display: 'NMS Interface',         section: 'MONITORING',  href: '/nms',                        prefixes: ['/nms'] },
  { key: 'traffic',            name: 'module.traffic',            display: 'Traffic Interface',     section: 'MONITORING',  href: '/monitoring/traffic',         prefixes: ['/monitoring/traffic', '/traffic'] },
  { key: 'content-monitoring', name: 'module.content-monitoring', display: 'Content Monitoring',    section: 'MONITORING',  href: '/monitoring/content',         prefixes: ['/monitoring/content'] },
  { key: 'pppoe',              name: 'module.pppoe',              display: 'PPPoE Sessions',        section: 'MONITORING',  href: '/monitoring/pppoe',           prefixes: ['/monitoring/pppoe'] },
  { key: 'queue',              name: 'module.queue',              display: 'Simple Queue',          section: 'MONITORING',  href: '/monitoring/queue',           prefixes: ['/monitoring/queue', '/queue'] },
  { key: 'ippool',             name: 'module.ippool',             display: 'IP Pool',               section: 'MONITORING',  href: '/monitoring/ippool',          prefixes: ['/monitoring/ippool', '/ippool'] },
  { key: 'firewall',           name: 'module.firewall',           display: 'Firewall',              section: 'MONITORING',  href: '/monitoring/firewall',        prefixes: ['/monitoring/firewall'] },
  { key: 'olt-management',     name: 'module.olt-management',     display: 'OLT Management',        section: 'MONITORING',  href: '/monitoring/olt-management',  prefixes: ['/monitoring/olt', '/olt', '/olt-mgmt'] },
  { key: 'genieacs',           name: 'module.genieacs',           display: 'ONT Management',        section: 'MONITORING',  href: '/genieacs',                   prefixes: ['/genieacs', '/ont'] },
  { key: 'ping',               name: 'module.ping',               display: 'Host Monitor',          section: 'MONITORING',  href: '/monitoring/ping',            prefixes: ['/monitoring/ping'] },
  { key: 'qos-monitor',        name: 'module.qos-monitor',        display: 'QoS & SLA',             section: 'MONITORING',  href: '/monitoring/qos',             prefixes: ['/monitoring/qos', '/qos'] },
  { key: 'devices',            name: 'module.devices',            display: 'Device Management',     section: 'MONITORING',  href: '/devices',                    prefixes: ['/devices', '/snmp'] },
  { key: 'device-monitor',     name: 'module.device-monitor',     display: 'Device Monitor',        section: 'MONITORING',  href: '/monitoring/device-monitor',  prefixes: ['/monitoring/device-monitor'] },
  { key: 'hotspot',            name: 'module.hotspot',            display: 'Hotspot',               section: 'MONITORING',  href: '/monitoring/hotspot',         prefixes: ['/monitoring/hotspot', '/hotspot'] },
  { key: 'voucher-template',   name: 'module.voucher-template',   display: 'Template Voucher',      section: 'MONITORING',  href: '/voucher-template',           prefixes: ['/voucher-template', '/voucher'] },
  { key: 'reseller-voucher',   name: 'module.reseller-voucher',   display: 'Reseller Voucher',      section: 'MONITORING',  href: '/reseller-voucher',           prefixes: ['/reseller-voucher'] },

  // TICKETING
  { key: 'tickets',            name: 'module.tickets',            display: 'Tickets',               section: 'TICKETING',   href: '/tickets',                    prefixes: ['/tickets'] },
  { key: 'todos',              name: 'module.todos',              display: 'To Do List',            section: 'TICKETING',   href: '/todos',                      prefixes: ['/todos'] },
  { key: 'work-orders',        name: 'module.work-orders',        display: 'Work Order',            section: 'TICKETING',   href: '/work-orders',                prefixes: ['/work-orders', '/work-order'] },

  // WA GATEWAY
  { key: 'whatsapp',           name: 'module.whatsapp',           display: 'WA Gateway',            section: 'WA GATEWAY',  href: '/whatsapp',                   prefixes: ['/whatsapp', '/wa'] },
  { key: 'message-logs',       name: 'module.message-logs',       display: 'Message Logs',          section: 'WA GATEWAY',  href: '/message-logs',               prefixes: ['/message-logs'] },
  { key: 'broadcast',          name: 'module.broadcast',          display: 'Broadcast',             section: 'WA GATEWAY',  href: '/broadcast',                  prefixes: ['/broadcast'] },
  { key: 'wa-templates',       name: 'module.wa-templates',       display: 'Templates',             section: 'WA GATEWAY',  href: '/wa/templates',               prefixes: ['/wa/templates'] },
  { key: 'wa-reminder',        name: 'module.wa-reminder',        display: 'Auto Reminder',         section: 'WA GATEWAY',  href: '/wa/reminder',                prefixes: ['/wa/reminder'] },
  { key: 'wa-report',          name: 'module.wa-report',          display: 'Auto Report',           section: 'WA GATEWAY',  href: '/wa/report',                  prefixes: ['/wa/report'] },

  // TELEGRAM
  { key: 'telegram',           name: 'module.telegram',           display: 'Telegram Center',       section: 'TELEGRAM',    href: '/telegram',                   prefixes: ['/telegram'] },
  { key: 'telegram-report',    name: 'module.telegram-report',    display: 'Telegram Report',       section: 'TELEGRAM',    href: '/telegram/report',            prefixes: ['/telegram/report'] },
  { key: 'telegram-backup',    name: 'module.telegram-backup',    display: 'Telegram Backup',       section: 'TELEGRAM',    href: '/telegram/backup',            prefixes: ['/telegram/backup'] },

  // EMAIL
  { key: 'email-broadcast',    name: 'module.email-broadcast',    display: 'Broadcast Email',       section: 'EMAIL',       href: '/email-broadcast',            prefixes: ['/email-broadcast'] },
  { key: 'email-template',     name: 'module.email-template',     display: 'Email Template',        section: 'EMAIL',       href: '/email-template',             prefixes: ['/email-template'] },
  { key: 'email-log',          name: 'module.email-log',          display: 'Riwayat Email',         section: 'EMAIL',       href: '/email-log',                  prefixes: ['/email-log'] },
  { key: 'email-statistic',    name: 'module.email-statistic',    display: 'Email Statistic',       section: 'EMAIL',       href: '/email-statistic',            prefixes: ['/email-statistic'] },
  { key: 'email-schedule',     name: 'module.email-schedule',     display: 'Email Schedule',        section: 'EMAIL',       href: '/email-schedule',             prefixes: ['/email-schedule'] },
  { key: 'invoice-broadcast',  name: 'module.invoice-broadcast',  display: 'Broadcast Invoice',     section: 'EMAIL',       href: '/invoice-broadcast',          prefixes: ['/invoice-broadcast'] },
  { key: 'mikrotik-backup',    name: 'module.mikrotik-backup',    display: 'Backup MikroTik',       section: 'EMAIL',       href: '/mikrotik-backup',            prefixes: ['/mikrotik-backup'] },

  // MANAGEMENT
  { key: 'isolir',             name: 'module.isolir',             display: 'Isolir',                section: 'MANAGEMENT',  href: '/isolir',                     prefixes: ['/isolir'] },
  { key: 'hotspot-binding',    name: 'module.hotspot-binding',    display: 'Hotspot Binding',       section: 'MANAGEMENT',  href: '/hotspot-binding',            prefixes: ['/hotspot-binding'] },
  { key: 'ip-addressing',      name: 'module.ip-addressing',      display: 'IP Addressing',         section: 'MANAGEMENT',  href: '/ip-addressing',              prefixes: ['/ip-addressing'] },
  { key: 'customers',          name: 'module.customers',          display: 'Customers',             section: 'MANAGEMENT',  href: '/customers',                  prefixes: ['/customers'] },
  { key: 'billing',            name: 'module.billing',            display: 'Daftar Tagihan',        section: 'MANAGEMENT',  href: '/billing',                    prefixes: ['/billing'] },
  { key: 'invoice-template',   name: 'module.invoice-template',   display: 'Template Invoice',      section: 'MANAGEMENT',  href: '/invoice-template',           prefixes: ['/invoice-template', '/invoice'] },
  { key: 'packages',           name: 'module.packages',           display: 'Paket Layanan',         section: 'MANAGEMENT',  href: '/packages',                   prefixes: ['/packages'] },
  { key: 'payments',           name: 'module.payments',           display: 'Pembayaran',            section: 'MANAGEMENT',  href: '/payments',                   prefixes: ['/payments'] },
  { key: 'keuangan',           name: 'module.keuangan',           display: 'Keuangan',              section: 'MANAGEMENT',  href: '/keuangan',                   prefixes: ['/keuangan'] },
  { key: 'laporan',            name: 'module.laporan',            display: 'Lap. Keuangan',         section: 'MANAGEMENT',  href: '/laporan',                    prefixes: ['/laporan'] },
  { key: 'infrastructure',     name: 'module.infrastructure',     display: 'Infrastructure',        section: 'MANAGEMENT',  href: '/infrastructure',             prefixes: ['/infrastructure'] },
  { key: 'gps-tracking',       name: 'module.gps-tracking',       display: 'GPS Tracking',          section: 'MANAGEMENT',  href: '/gps-tracking',               prefixes: ['/gps-tracking', '/gps', '/technician-location', '/technician-tracking'] },
  { key: 'assets',             name: 'module.assets',             display: 'Asset Management',      section: 'MANAGEMENT',  href: '/assets',                     prefixes: ['/assets'] },
  { key: 'collect',            name: 'module.collect',            display: 'Collect Billing',       section: 'MANAGEMENT',  href: '/collect',                    prefixes: ['/collect'] },

  // SISTEM
  { key: 'resources',          name: 'module.resources',          display: 'System Resource',       section: 'SISTEM',      href: '/system/resources',           prefixes: ['/system/resources', '/resources'] },
  { key: 'topology',           name: 'module.topology',           display: 'Topology',              section: 'SISTEM',      href: '/system/topology',            prefixes: ['/system/topology', '/topology'] },
  { key: 'logs',               name: 'module.logs',               display: 'Activity Logs',         section: 'SISTEM',      href: '/logs',                       prefixes: ['/logs', '/activity-logs'] },
  { key: 'settings',           name: 'module.settings',           display: 'Settings',              section: 'SISTEM',      href: '/settings',                   prefixes: ['/settings', '/app-settings', '/system/database', '/users', '/roles', '/permissions'] },
];

/** Path app mobile → modul yang sama dengan sidebar desktop (satu permission). */
const MOBILE_PATHS = {
  dashboard: ['/mobile'],
  customers: ['/mobile/customers'],
  payments: ['/mobile/payments', '/mobile/payment-new'],
  billing: ['/mobile/invoice'],
  'wa-reminder': ['/mobile/reminder'],
  whatsapp: ['/mobile/wa'],
  tickets: ['/mobile/ticket'],
  keuangan: ['/mobile/keuangan'],
  laporan: ['/mobile/finance'],
  traffic: ['/mobile/monitoring'],
  'content-monitoring': ['/mobile/content'],
  queue: ['/mobile/queue'],
  isolir: ['/mobile/isolir'],
  hotspot: ['/mobile/hotspot'],
  'voucher-template': ['/mobile/voucher'],
  packages: ['/mobile/packages'],
  assets: ['/mobile/assets'],
  'hotspot-binding': ['/mobile/hotspot-binding'],
  ping: ['/mobile/host'],
  infrastructure: ['/mobile/infrastructure'],
  noc: ['/mobile/noc'],
  settings: ['/mobile/roles']
};

for (const [key, paths] of Object.entries(MOBILE_PATHS)) {
  const mod = SIDEBAR_MODULES.find(m => m.key === key);
  if (!mod) continue;
  mod.prefixes = [...new Set([...(mod.prefixes || []), ...paths])];
}

/**
 * Item drawer app mobile. key/name sama dengan SIDEBAR_MODULES
 * supaya centang di Hak Akses berlaku di desktop dan mobile.
 */
const MOBILE_DRAWER_MODULES = [
  { key: 'dashboard',          name: 'module.dashboard',          display: 'Beranda',            group: 'Menu Utama', href: '/mobile' },
  { key: 'customers',          name: 'module.customers',          display: 'Pelanggan',          group: 'Menu Utama', href: '/mobile/customers' },
  { key: 'payments',           name: 'module.payments',           display: 'Pembayaran',         group: 'Menu Utama', href: '/mobile/payments' },
  { key: 'billing',            name: 'module.billing',            display: 'Invoice',            group: 'Menu Utama', href: '/mobile/invoice' },
  { key: 'wa-reminder',        name: 'module.wa-reminder',        display: 'Reminder Tagihan',   group: 'Menu Utama', href: '/mobile/reminder' },
  { key: 'whatsapp',           name: 'module.whatsapp',           display: 'WhatsApp Gateway',   group: 'Menu Utama', href: '/mobile/wa' },
  { key: 'tickets',            name: 'module.tickets',            display: 'Tiket',              group: 'Menu Utama', href: '/mobile/ticket' },
  { key: 'keuangan',           name: 'module.keuangan',           display: 'Keuangan',           group: 'Laporan',     href: '/mobile/keuangan' },
  { key: 'laporan',            name: 'module.laporan',            display: 'Laporan Keuangan',   group: 'Laporan',     href: '/mobile/finance' },
  { key: 'traffic',            name: 'module.traffic',            display: 'Monitoring',         group: 'Jaringan',    href: '/mobile/monitoring' },
  { key: 'content-monitoring', name: 'module.content-monitoring', display: 'Content Monitoring', group: 'Jaringan',    href: '/mobile/content' },
  { key: 'queue',              name: 'module.queue',              display: 'Simple Queue',       group: 'Jaringan',    href: '/mobile/queue' },
  { key: 'isolir',             name: 'module.isolir',             display: 'Isolir',             group: 'Jaringan',    href: '/mobile/isolir' },
  { key: 'hotspot',            name: 'module.hotspot',            display: 'Hotspot',            group: 'Jaringan',    href: '/mobile/hotspot' },
  { key: 'voucher-template',   name: 'module.voucher-template',   display: 'Voucher',            group: 'Jaringan',    href: '/mobile/voucher' },
  { key: 'packages',           name: 'module.packages',           display: 'Paket Layanan',      group: 'Jaringan',    href: '/mobile/packages' },
  { key: 'assets',             name: 'module.assets',             display: 'Aset & Inventaris',  group: 'Jaringan',    href: '/mobile/assets' },
  { key: 'hotspot-binding',    name: 'module.hotspot-binding',    display: 'Hotspot Binding',    group: 'Jaringan',    href: '/mobile/hotspot-binding' },
  { key: 'ping',               name: 'module.ping',               display: 'Host Terdeteksi',    group: 'Jaringan',    href: '/mobile/host' },
  { key: 'infrastructure',     name: 'module.infrastructure',     display: 'Infrastruktur',      group: 'Jaringan',    href: '/mobile/infrastructure' },
  { key: 'noc',                name: 'module.noc',                display: 'NOC / Jaringan',     group: 'Jaringan',    href: '/mobile/noc' },
  { key: 'settings',           name: 'module.settings',           display: 'Hak Akses Role',     group: 'Pengaturan',  href: '/mobile/roles' }
];

const MOBILE_HREF_MODULE = Object.fromEntries(
  MOBILE_DRAWER_MODULES.map(m => [m.href, m.key])
);
MOBILE_HREF_MODULE['/mobile/payment-new'] = 'payments';

const SECTION_ORDER = [
  'APP MOBILE',
  'OVERVIEW',
  'MONITORING',
  'TICKETING',
  'WA GATEWAY',
  'TELEGRAM',
  'EMAIL',
  'MANAGEMENT',
  'SISTEM'
];

const ALL_KEYS = SIDEBAR_MODULES.map(m => m.key);

/** Default grant per role — menyamai menu yang sudah tampil sekarang.
 *  Role yang tidak terdaftar mulai kosong; admin bisa mencentang manual. */
const DEFAULT_ROLE_MODULES = {
  superadmin: ALL_KEYS,
  admin: ALL_KEYS,
  demo: ALL_KEYS.filter(k => ![
    'settings', 'broadcast', 'wa-reminder', 'wa-report', 'isolir', 'topology', 'whatsapp'
  ].includes(k)),
  finance: [
    'finance', 'customers', 'packages', 'billing', 'invoice-template', 'payments',
    'keuangan', 'laporan',
    'email-broadcast', 'email-template', 'email-log', 'email-statistic', 'email-schedule'
  ],
  noc: [
    'noc', 'nms', 'traffic', 'content-monitoring', 'pppoe', 'queue', 'ippool', 'firewall',
    'olt-management', 'genieacs', 'ping', 'qos-monitor', 'devices', 'device-monitor',
    'hotspot', 'reseller-voucher',
    'infrastructure', 'assets', 'topology', 'resources',
    'sales', 'tickets', 'work-orders', 'todos', 'isolir', 'collect', 'gps-tracking', 'logs'
  ],
  sales: ['sales', 'tickets', 'todos', 'work-orders'],
  tenant_owner: ['tenant', 'customers', 'billing', 'payments', 'packages'],
  collector: ['collect'],
  technician: ['tickets', 'todos', 'work-orders']
};

function groupedModules() {
  return SECTION_ORDER.map(section => ({
    section,
    items: SIDEBAR_MODULES.filter(m => m.section === section)
  })).filter(g => g.items.length);
}

function groupedMobileModules() {
  const order = ['Menu Utama', 'Laporan', 'Jaringan', 'Pengaturan'];
  return order.map(group => ({
    group,
    items: MOBILE_DRAWER_MODULES.filter(m => m.group === group)
  })).filter(g => g.items.length);
}

module.exports = {
  SIDEBAR_MODULES,
  MOBILE_DRAWER_MODULES,
  MOBILE_HREF_MODULE,
  MOBILE_PATHS,
  SECTION_ORDER,
  ALL_KEYS,
  DEFAULT_ROLE_MODULES,
  groupedModules,
  groupedMobileModules
};
