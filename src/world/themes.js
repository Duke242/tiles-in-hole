// Worlds. Each theme is a palette, a ground/sky look and a spawn table of
// [sculpt, weight, minimum level]. Themes rotate every few levels.

export const THEMES = [
  {
    id: 'city', name: 'City',
    ground: '#58b334', plate: '#8ad64c', groundDot: '#7cc843', sky: ['#3d9be6', '#c6ebfb'],
    rim: ['#ffd23e', '#2c6cf5'],
    P: {
      walls: ['#f0842a', '#e8452f', '#3e8ef0', '#f4c542', '#7fd1e8', '#e8459a', '#8a5fd8', '#f4f1ea'],
      glass: '#bfe9fa', roofs: ['#c03b2b', '#3a3f4a', '#2f6fe8'], dark: '#3a3f4a',
      trunk: '#7a4e22', leaf: '#3fae3a', pine: '#2b8f3c',
      cars: ['#e5322c', '#2f6fe8', '#f5c518', '#e8459a', '#f4f1ea'],
      yellow: '#f5c518', red: '#e5322c', blue: '#2f6fe8', white: '#f4f1ea', water: '#4fd0ea',
      stone: '#d9d2c2', mint: '#7fe0b4', brown: '#8b5a2b',
      tiles: ['#e5322c', '#2f6fe8', '#f5c518', '#33c24a', '#8a5fd8', '#e8459a', '#f0842a', '#4fd0ea'],
    },
    spawn: [
      ['stack', 40, 1], ['slab', 10, 1], ['pile', 6, 2], ['tree', 12, 1], ['lamp', 5, 1], ['bench', 4, 1],
      ['car', 8, 2], ['bus', 3, 4], ['house', 8, 3], ['fountain', 2, 6], ['building', 9, 5],
      ['tower', 3, 10], ['statue', 2, 18],
    ],
  },
  {
    id: 'fruit', name: 'Fruit Garden',
    ground: '#178f7a', plate: '#2cbba1', groundDot: '#27ad95', sky: ['#3d9be6', '#c6ebfb'],
    rim: ['#ff5a5a', '#3cc46a'],
    P: {
      yellow: '#ffd23e', yellowDark: '#e0a91c', leaf: '#3fae3a', stem: '#7a4e22',
      red: '#e5322c', seed: '#fff4d6', purple: '#8a5fd8', orange: '#ff8c1a', green: '#7cd63c', blue: '#3e8ef0',
      melonSkin: '#2f9e44', rind: '#f4f1ea', flesh: '#ff4f6d',
      tiles: ['#ffd23e', '#e5322c', '#8a5fd8', '#ff8c1a', '#7cd63c', '#3e8ef0', '#ff4f6d', '#f4f1ea'],
    },
    spawn: [
      ['stack', 36, 1], ['slab', 8, 1], ['pile', 6, 2], ['cherry', 8, 1], ['berries', 6, 1], ['apple', 8, 2],
      ['orange', 8, 2], ['banana', 6, 3], ['melon', 5, 4], ['strawberry', 7, 5], ['grapes', 6, 6],
      ['pineapple', 5, 8],
    ],
  },
  {
    id: 'park', name: 'Fun Park',
    ground: '#5cb63e', plate: '#8fdc55', groundDot: '#80cc4a', sky: ['#4aa9f0', '#d2effc'],
    rim: ['#ffd23e', '#ff4fa3'],
    P: {
      yellow: '#ffd23e', white: '#f6f3ee', red: '#e8452f', blue: '#3e8ef0', pink: '#ff69b4', dark: '#3a3f4a',
      green: '#33c24a',
      cabins: ['#e8452f', '#3e8ef0', '#ffd23e', '#33c24a', '#ff69b4', '#8a5fd8', '#ff8c1a', '#4fd0ea'],
      pastel: ['#ff8fb8', '#8fd3ff', '#ffe08a', '#b8f0a0', '#d9b3ff', '#ffb27a'],
      tiles: ['#e8452f', '#3e8ef0', '#ffd23e', '#33c24a', '#ff69b4', '#8a5fd8', '#ff8c1a', '#f6f3ee'],
    },
    spawn: [
      ['stack', 34, 1], ['slab', 8, 1], ['pile', 6, 2], ['balloons', 8, 1], ['swing', 6, 2], ['slide', 6, 3],
      ['tent', 7, 4], ['carousel', 4, 7], ['dropTower', 3, 12], ['ferris', 2, 14],
    ],
  },
  {
    id: 'food', name: 'Food Street',
    ground: '#d9bd85', plate: '#f3dfb0', groundDot: '#e9d29c', sky: ['#4aa9f0', '#d2effc'],
    rim: ['#ffd23e', '#e8452f'],
    P: {
      bun: '#e8b46a', patty: '#7a4a24', cheese: '#ffcf3d', lettuce: '#66d14b', tomato: '#e8452f', sesame: '#fff4d6',
      icing: '#ff8fb8', dough: '#e8b46a', sprinkles: ['#3e8ef0', '#ffd23e', '#33c24a', '#f6f3ee', '#8a5fd8'],
      cone: '#e0a15a', coneDark: '#b57a3a', scoops: ['#ff8fb8', '#fff1c9', '#8b5a2b', '#b8f0a0', '#8fd3ff'],
      pink: '#ff8fb8', cream: '#fff1c9', red: '#e8452f', white: '#f6f3ee', straw: '#3e8ef0',
      sausage: '#c8553d', mustard: '#ffd23e', crust: '#d9a05e', tableTop: '#f6f3ee', chair: '#e8452f',
      dark: '#3a3f4a', fryBox: '#e8452f', fry: '#ffd23e',
      tiles: ['#e8452f', '#ffd23e', '#ff8fb8', '#66d14b', '#3e8ef0', '#8b5a2b', '#f6f3ee', '#ff8c1a'],
    },
    spawn: [
      ['stack', 34, 1], ['slab', 8, 1], ['pile', 6, 2], ['cup', 8, 1], ['fries', 6, 1], ['donut', 8, 2],
      ['hotdog', 6, 3], ['tableset', 6, 3], ['icecream', 7, 4], ['pizza', 6, 5], ['burger', 7, 6],
      ['cake', 4, 9],
    ],
  },
  {
    id: 'water', name: 'Water Park',
    ground: '#5cb63e', plate: '#8fdc55', groundDot: '#80cc4a', sky: ['#3d9be6', '#c6ebfb'],
    rim: ['#ffd23e', '#4fd0ea'],
    P: {
      tile: '#f6f3ee', water: '#2f8fe8', waterLight: '#7fd1ff', trunk: '#a56b32', leaf: '#3fae3a', coconut: '#7a4e22',
      white: '#f6f3ee', red: '#e8452f', blue: '#3e8ef0', pink: '#ff69b4', yellow: '#ffd23e',
      slides: ['#8ee04a', '#ff69b4', '#ff8c1a', '#4fd0ea', '#8a5fd8'],
      tiles: ['#2f8fe8', '#ffd23e', '#ff69b4', '#8ee04a', '#ff8c1a', '#f6f3ee', '#8a5fd8', '#e8452f'],
    },
    spawn: [
      ['stack', 34, 1], ['slab', 8, 1], ['pile', 6, 2], ['floatRing', 8, 1], ['lounger', 8, 1], ['umbrella', 8, 2],
      ['palm', 8, 3], ['pool', 5, 5], ['spiral', 3, 10],
    ],
  },
];

// Bombs show up in every world from level 6 on.
for (const t of THEMES) t.spawn.push(['bomb', 4, 6]);

// Level → theme: three levels per world, then the next one.
export function themeForLevel(n) {
  return THEMES[Math.floor((n - 1) / 3) % THEMES.length];
}
