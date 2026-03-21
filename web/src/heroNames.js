const HERO_NAMES = {
  1: 'Anti-Mage', 2: 'Axe', 3: 'Bane', 4: 'Bloodseeker', 5: 'Crystal Maiden',
  6: 'Drow Ranger', 7: 'Earthshaker', 8: 'Juggernaut', 9: 'Mirana', 10: 'Morphling',
  11: 'Shadow Fiend', 12: 'Phantom Lancer', 13: 'Puck', 14: 'Pudge', 15: 'Razor',
  16: 'Sand King', 17: 'Storm Spirit', 18: 'Sven', 19: 'Tiny', 20: 'Vengeful Spirit',
  21: 'Windranger', 22: 'Zeus', 23: 'Kunkka', 25: 'Lina', 26: 'Lion',
  27: 'Shadow Shaman', 28: 'Slardar', 29: 'Tidehunter', 30: 'Witch Doctor',
  31: 'Lich', 32: 'Riki', 33: 'Enigma', 34: 'Tinker', 35: 'Sniper',
  36: 'Necrophos', 37: 'Warlock', 38: 'Beastmaster', 39: 'Queen of Pain',
  40: 'Venomancer', 41: 'Faceless Void', 42: 'Wraith King', 43: 'Death Prophet',
  44: 'Phantom Assassin', 45: 'Pugna', 46: 'Templar Assassin', 47: 'Viper',
  48: 'Luna', 49: 'Dragon Knight', 50: 'Dazzle', 51: 'Clockwerk', 52: 'Leshrac',
  53: "Nature's Prophet", 54: 'Lifestealer', 55: 'Dark Seer', 56: 'Clinkz',
  57: 'Omniknight', 58: 'Enchantress', 59: 'Huskar', 60: 'Night Stalker',
  61: 'Broodmother', 62: 'Bounty Hunter', 63: 'Weaver', 64: 'Jakiro',
  65: 'Batrider', 66: 'Chen', 67: 'Spectre', 68: 'Ancient Apparition',
  69: 'Doom', 70: 'Ursa', 71: 'Spirit Breaker', 72: 'Gyrocopter',
  73: 'Alchemist', 74: 'Invoker', 75: 'Silencer', 76: 'Outworld Devourer',
  77: 'Lycan', 78: 'Brewmaster', 79: 'Shadow Demon', 80: 'Lone Druid',
  81: 'Chaos Knight', 82: 'Meepo', 83: 'Treant Protector', 84: 'Ogre Magi',
  85: 'Undying', 86: 'Rubick', 87: 'Disruptor', 88: 'Nyx Assassin',
  89: 'Naga Siren', 90: 'Keeper of the Light', 91: 'Io', 92: 'Visage',
  93: 'Slark', 94: 'Medusa', 95: 'Troll Warlord', 96: 'Centaur Warrunner',
  97: 'Magnus', 98: 'Timbersaw', 99: 'Bristleback', 100: 'Tusk',
  101: 'Skywrath Mage', 102: 'Abaddon', 103: 'Elder Titan', 104: 'Legion Commander',
  105: 'Techies', 106: 'Ember Spirit', 107: 'Earth Spirit', 108: 'Underlord',
  109: 'Terrorblade', 110: 'Phoenix', 111: 'Oracle', 112: 'Winter Wyvern',
  113: 'Arc Warden', 114: 'Monkey King', 119: 'Dark Willow', 120: 'Pangolier',
  121: 'Grimstroke', 123: 'Hoodwink', 126: 'Void Spirit', 128: 'Snapfire',
  129: 'Mars', 131: 'Ring Master', 135: 'Dawnbreaker', 136: 'Marci',
  137: 'Primal Beast', 138: 'Muerta', 145: 'Kez', 155: 'Largo',
};

export const ALL_HEROES = Object.entries(HERO_NAMES)
  .map(([id, name]) => ({ id: parseInt(id), name }))
  .sort((a, b) => a.name.localeCompare(b.name));

export const ALL_HERO_IDS = ALL_HEROES.map(h => h.id);

export function getHeroName(heroId, fallbackName) {
  if (HERO_NAMES[heroId]) return HERO_NAMES[heroId];
  if (fallbackName && fallbackName.startsWith('npc_dota_hero_')) {
    const clean = fallbackName.replace('npc_dota_hero_', '').replace(/_/g, ' ');
    return clean.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  return fallbackName || `Hero #${heroId}`;
}

const HERO_ID_TO_SLUG = {
  1:'antimage',2:'axe',3:'bane',4:'bloodseeker',5:'crystal_maiden',6:'drow_ranger',
  7:'earthshaker',8:'juggernaut',9:'mirana',10:'morphling',11:'nevermore',
  12:'phantom_lancer',13:'puck',14:'pudge',15:'razor',16:'sand_king',17:'storm_spirit',
  18:'sven',19:'tiny',20:'vengefulspirit',21:'windrunner',22:'zuus',23:'kunkka',
  25:'lina',26:'lion',27:'shadow_shaman',28:'slardar',29:'tidehunter',30:'witch_doctor',
  31:'lich',32:'riki',33:'enigma',34:'tinker',35:'sniper',36:'necrolyte',37:'warlock',
  38:'beastmaster',39:'queenofpain',40:'venomancer',41:'faceless_void',42:'skeleton_king',
  43:'death_prophet',44:'phantom_assassin',45:'pugna',46:'templar_assassin',47:'viper',
  48:'luna',49:'dragon_knight',50:'dazzle',51:'rattletrap',52:'leshrac',53:'furion',
  54:'life_stealer',55:'dark_seer',56:'clinkz',57:'omniknight',58:'enchantress',
  59:'huskar',60:'night_stalker',61:'broodmother',62:'bounty_hunter',63:'weaver',
  64:'jakiro',65:'batrider',66:'chen',67:'spectre',68:'ancient_apparition',
  69:'doom_bringer',70:'ursa',71:'spirit_breaker',72:'gyrocopter',73:'alchemist',
  74:'invoker',75:'silencer',76:'obsidian_destroyer',77:'lycan',78:'brewmaster',
  79:'shadow_demon',80:'lone_druid',81:'chaos_knight',82:'meepo',83:'treant',
  84:'ogre_magi',85:'undying',86:'rubick',87:'disruptor',88:'nyx_assassin',
  89:'naga_siren',90:'keeper_of_the_light',91:'wisp',92:'visage',93:'slark',
  94:'medusa',95:'troll_warlord',96:'centaur',97:'magnataur',98:'shredder',
  99:'bristleback',100:'tusk',101:'skywrath_mage',102:'abaddon',103:'elder_titan',
  104:'legion_commander',105:'techies',106:'ember_spirit',107:'earth_spirit',
  108:'abyssal_underlord',109:'terrorblade',110:'phoenix',111:'oracle',
  112:'winter_wyvern',113:'arc_warden',114:'monkey_king',119:'dark_willow',
  120:'pangolier',121:'grimstroke',123:'hoodwink',126:'void_spirit',128:'snapfire',
  129:'mars',131:'ringmaster',135:'dawnbreaker',136:'marci',137:'primal_beast',
  138:'muerta',145:'kez',155:'largo',
};

export function getHeroImageUrl(heroId, heroName) {
  let slug = HERO_ID_TO_SLUG[heroId];
  if (!slug && heroName && heroName.startsWith('npc_dota_hero_')) {
    slug = heroName.replace('npc_dota_hero_', '');
  }
  if (!slug) return null;
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${slug}.png`;
}

const ITEM_ID_TO_SLUG = {
  1:'blink',2:'blades_of_attack',3:'broadsword',4:'chainmail',5:'claymore',6:'helm_of_iron_will',
  7:'javelin',8:'mithril_hammer',9:'platemail',10:'quarterstaff',11:'quelling_blade',
  12:'ring_of_protection',13:'gauntlets',14:'slippers',15:'mantle',16:'branches',
  17:'belt_of_strength',18:'boots_of_elves',19:'robe',20:'circlet',21:'ogre_axe',
  22:'blade_of_alacrity',23:'staff_of_wizardry',24:'ultimate_orb',25:'void_stone',
  26:'mystic_staff',27:'energy_booster',28:'point_booster',29:'vitality_booster',
  30:'power_treads',31:'hand_of_midas',32:'oblivion_staff',33:'perseverance',34:'bracer',
  35:'wraith_band',36:'null_talisman',37:'mekansm',38:'vladmir',39:'buckler',
  40:'ring_of_basilius',41:'pipe',42:'urn_of_shadows',43:'headdress',44:'sheepstick',
  46:'orchid',47:'cyclone',48:'force_staff',49:'dagon',50:'necronomicon',
  51:'ultimate_scepter',52:'refresher',53:'assault',54:'heart',55:'black_king_bar',
  56:'aegis',57:'shivas_guard',58:'bloodstone',59:'sphere',60:'vanguard',
  63:'blade_mail',64:'soul_booster',65:'hood_of_defiance',67:'rapier',
  68:'monkey_king_bar',69:'radiance',71:'butterfly',73:'greater_crit',
  74:'armlet',75:'invis_sword',76:'sange_and_yasha',77:'satanic',78:'mjollnir',
  79:'basher',80:'manta',81:'desolator',85:'lesser_crit',86:'ethereal_blade',
  88:'soul_ring',89:'arcane_boots',90:'octarine_core',92:'orb_of_venom',
  93:'stout_shield',94:'drum_of_endurance',96:'crimson_guard',97:'aether_lens',
  98:'abyssal_blade',100:'heavens_halberd',104:'tranquil_boots',106:'shadow_amulet',
  108:'ultimate_scepter',112:'bottle',119:'mask_of_madness',121:'helm_of_the_dominator',
  122:'sange',123:'yasha',124:'maelstrom',125:'diffusal_blade',127:'dragon_lance',
  129:'echo_sabre',131:'silver_edge',132:'glimmer_cape',133:'solar_crest',
  135:'guardian_greaves',139:'moon_shard',141:'wind_lace',143:'infused_raindrop',
  145:'blight_stone',147:'wind_waker',148:'lotus_orb',149:'meteor_hammer',
  150:'nullifier',151:'spirit_vessel',152:'holy_locket',154:'kaya',
  156:'crown',158:'aeon_disk',160:'kaya_and_sange',162:'yasha_and_kaya',
  164:'phylactery',166:'falcon_blade',168:'witch_blade',170:'blood_grenade',
  172:'parasma',174:'disperser',176:'khanda',178:'harpoon',180:'pavise',
  190:'mage_slayer',206:'aghanims_shard',
  236:'overwhelming_blink',237:'swift_blink',238:'arcane_blink',240:'boots',
  1021:'bloodthorn',
};

export function getItemImageUrl(itemName, itemId) {
  let slug = null;
  if (itemName) {
    slug = itemName.replace('item_', '');
  }
  if ((!slug || /^\d+$/.test(slug)) && itemId && ITEM_ID_TO_SLUG[itemId]) {
    slug = ITEM_ID_TO_SLUG[itemId];
  }
  if (!slug) return null;
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/${slug}.png`;
}
