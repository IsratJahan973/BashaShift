export const areas = ['Banasree', 'Rampura', 'Khilgaon', 'Mirpur', 'Dhanmondi', 'Uttara', 'Mohammadpur', 'Bashundhara', 'Gulshan', 'Other'];
export const furniture = [
  { key: 'Bed', label: 'Bed', price: 450, icon: 'bed-double' },
  { key: 'Sofa', label: 'Sofa', price: 380, icon: 'sofa' },
  { key: 'Refrigerator', label: 'Refrigerator', price: 350, icon: 'refrigerator' },
  { key: 'Wardrobe', label: 'Wardrobe', price: 420, icon: 'archive' },
  { key: 'Dining table', label: 'Dining table', price: 280, icon: 'utensils' },
  { key: 'Washing machine', label: 'Washing machine', price: 300, icon: 'washing-machine' },
  { key: 'Boxes', label: 'Moving boxes', price: 70, icon: 'package' },
  { key: 'Other', label: 'Other / unsure', price: 180, icon: 'package-open' },
];
export const sampleListings = [
  { id: 'home-demo-1', title: 'Sunlit family apartment', area: 'Banasree', block: 'Block C', rent: 22000, beds: 3, baths: 2, sqft: 1280, floor: 4, lift: true, balcony: true, parking: false, available: '2026-12-01', description: 'Open living space, two balconies, and easy road access. Illustrative property only.', ownerName: 'Demo Owner A', ownerPhone: '', sample: true, image: '', tone: 'sage' },
  { id: 'home-demo-2', title: 'Compact corner flat', area: 'Banasree', block: 'Block F', rent: 16500, beds: 2, baths: 2, sqft: 930, floor: 2, lift: false, balcony: true, parking: false, available: '2026-11-15', description: 'Bright corner unit close to local markets. Illustrative property only.', ownerName: 'Demo Owner B', ownerPhone: '', sample: true, image: '', tone: 'peach' },
  { id: 'home-demo-3', title: 'Spacious modern residence', area: 'Dhanmondi', block: 'Road 8/A', rent: 35000, beds: 3, baths: 3, sqft: 1640, floor: 5, lift: true, balcony: true, parking: true, available: '2026-12-01', description: 'Large family-friendly layout with parking. Illustrative property only.', ownerName: 'Demo Owner C', ownerPhone: '', sample: true, image: '', tone: 'blue' },
  { id: 'home-demo-4', title: 'Quiet two-bedroom home', area: 'Mirpur', block: 'Section 10', rent: 14500, beds: 2, baths: 1, sqft: 820, floor: 3, lift: false, balcony: false, parking: false, available: '2026-12-10', description: 'An efficient layout for a small household. Illustrative property only.', ownerName: 'Demo Owner D', ownerPhone: '', sample: true, image: '', tone: 'lavender' },
  { id: 'home-demo-5', title: 'Airy apartment with a view', area: 'Uttara', block: 'Sector 7', rent: 26500, beds: 3, baths: 2, sqft: 1350, floor: 6, lift: true, balcony: true, parking: true, available: '2026-12-01', description: 'Open rooms and natural light. Illustrative property only.', ownerName: 'Demo Owner E', ownerPhone: '', sample: true, image: '', tone: 'gold' },
  { id: 'home-demo-6', title: 'Easy-living family flat', area: 'Rampura', block: 'West Rampura', rent: 19000, beds: 2, baths: 2, sqft: 1020, floor: 3, lift: true, balcony: true, parking: false, available: '2026-11-20', description: 'Convenient for local commuters. Illustrative property only.', ownerName: 'Demo Owner F', ownerPhone: '', sample: true, image: '', tone: 'sage' }
];
export const sampleWorkers = [
  {id:'worker-demo-1',name:'Demo Mover A',area:'Banasree',skills:['Moving'],phone:'',sample:true,available:true,avatar:'MA'},
  {id:'worker-demo-2',name:'Demo Mover B',area:'Rampura',skills:['Moving'],phone:'',sample:true,available:true,avatar:'MB'},
  {id:'worker-demo-3',name:'Demo Mover C',area:'Mirpur',skills:['Moving'],phone:'',sample:true,available:true,avatar:'MC'}
];
export const initialDb = () => ({ listings: sampleListings, workers: sampleWorkers, inquiries: [], requests: [], selectedWorkerId: 'worker-demo-1' });
