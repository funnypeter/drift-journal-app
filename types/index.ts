export interface Profile {
  id: string
  email: string
  display_name?: string
  avatar_url?: string
  net_hole_size: number
  created_at: string
  updated_at: string
}

export interface Trip {
  id: string
  user_id: string
  title: string
  date: string
  location?: string
  state?: string
  lat?: number
  lng?: number
  flow?: string
  water_temp?: string
  gauge_height?: string
  air_temp?: string
  baro?: string
  weather?: string
  wind?: string
  moon?: string
  notes?: string
  bg_color?: string
  hero_photo_url?: string
  usgs_site_id?: string
  created_at: string
  updated_at: string
  catches?: Catch[]
}

export interface Catch {
  id: string
  trip_id: string
  user_id: string
  species: string
  length?: number
  fly?: string
  fly_category?: string
  fly_size?: string
  time_caught?: string
  date?: string
  notes?: string
  photo_url?: string
  photo_path?: string
  ai_confidence?: number
  sort_order: number
  created_at: string
  updated_at: string
}

export interface IdentifyResult {
  species: string
  length: string
  confidence: number
}

export interface USGSData {
  flow?: string
  waterTemp?: string
  gaugeHeight?: string
  siteId?: string
}

export interface WeatherData {
  airTemp?: string
  baro?: string
  weather?: string
  wind?: string
}

export type Platform = {
  label: string
  w: number
  h: number
}

export const PLATFORMS: Platform[] = [
  { label: 'Square', w: 1080, h: 1080 },
  { label: 'Portrait', w: 1080, h: 1350 },
  { label: 'Landscape', w: 1600, h: 900 },
  { label: 'Story', w: 1080, h: 1920 },
]

export const SPECIES_BY_CATEGORY: Record<string, string[]> = {
  'Trout & Char': [
    'Rainbow Trout', 'Brown Trout', 'Cutthroat Trout', 'Brook Trout',
    'Bull Trout', 'Lake Trout', 'Golden Trout', 'Tiger Trout',
    'Splake', 'Apache Trout', 'Gila Trout',
  ],
  'Salmon': [
    'Chinook Salmon', 'Coho Salmon', 'Sockeye Salmon', 'Pink Salmon',
    'Chum Salmon', 'Atlantic Salmon', 'Kokanee',
  ],
  'Steelhead & Anadromous': [
    'Steelhead',
  ],
  'Grayling & Whitefish': [
    'Arctic Grayling', 'Mountain Whitefish', 'Lake Whitefish',
  ],
  'Bass': [
    'Largemouth Bass', 'Smallmouth Bass', 'Spotted Bass', 'Striped Bass',
    'White Bass', 'Hybrid Striped Bass', 'Guadalupe Bass', 'Peacock Bass',
  ],
  'Panfish': [
    'Bluegill', 'Pumpkinseed', 'Redear Sunfish', 'Green Sunfish',
    'Rock Bass', 'Warmouth', 'Black Crappie', 'White Crappie',
    'Yellow Perch',
  ],
  'Walleye & Pike': [
    'Walleye', 'Sauger', 'Saugeye', 'Northern Pike', 'Muskellunge',
    'Tiger Muskie', 'Chain Pickerel',
  ],
  'Catfish': [
    'Channel Catfish', 'Blue Catfish', 'Flathead Catfish', 'Bullhead',
  ],
  'Carp & Rough Fish': [
    'Common Carp', 'Grass Carp', 'Freshwater Drum', 'Gar',
    'Bowfin', 'Buffalo',
  ],
  'Saltwater Inshore': [
    'Redfish', 'Snook', 'Spotted Seatrout', 'Flounder', 'Sheepshead',
    'Tarpon', 'Bonefish', 'Permit', 'Jack Crevalle', 'Pompano',
    'Red Drum', 'Black Drum', 'Mangrove Snapper',
  ],
  'Saltwater Offshore': [
    'Mahi-Mahi', 'Yellowfin Tuna', 'Bluefin Tuna', 'Wahoo',
    'King Mackerel', 'Spanish Mackerel', 'Cobia', 'Amberjack',
    'Grouper', 'Red Snapper', 'Sailfish', 'Blue Marlin', 'White Marlin',
    'Swordfish', 'Barracuda', 'Tripletail',
  ],
  'Saltwater Other': [
    'Halibut', 'Lingcod', 'Rockfish', 'Bluefish', 'Weakfish',
    'Tautog', 'Black Sea Bass', 'Summer Flounder', 'Winter Flounder',
  ],
}

export const SPECIES: string[] = Object.values(SPECIES_BY_CATEGORY).flat()

export const FLY_DATA: Record<string, string[]> = {
  'Dry Flies': ['Parachute Adams', 'Elk Hair Caddis', 'Royal Wulff', 'Blue Wing Olive', 'Stimulator', 'Pale Morning Dun', "Griffith's Gnat", 'CDC Caddis'],
  'Nymphs': ['Pheasant Tail', "Hare's Ear", 'Copper John', 'Prince Nymph', 'Zebra Midge', 'Bead Head Midge', 'San Juan Worm', "Pat's Rubber Legs"],
  'Streamers': ['Woolly Bugger', 'Clouser Minnow', 'Muddler Minnow', 'Sculpin', 'Zonker', 'Egg Sucking Leech'],
  'Terrestrials': ["Dave's Hopper", 'Chernobyl Ant', 'Foam Beetle', 'Flying Ant', 'Cicada'],
  'Emergers': ['RS2', 'Sparkle Dun', 'CDC Emerger', 'Flashback Emerger'],
}

export const FLY_SIZES = ['4','6','8','10','12','14','16','18','20','22','24']
