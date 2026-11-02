/**
 * Only concrete words that a single emoji shows without doubt. Words with two
 * common meanings (bat, glass, watch, fly, light, orange, turkey), abstract words,
 * verbs and adjectives stay unassigned, and synonyms keep one emoji so the picture
 * game never offers two identical pictures.
 */
const emojiByTerm: Record<string, string> = {
  apple: '🍎', banana: '🍌', grape: '🍇', tomato: '🍅', potato: '🥔', corn: '🌽', bread: '🍞', cheese: '🧀', egg: '🥚', cake: '🍰', hamburger: '🍔', pizza: '🍕', 'ice cream': '🍦', chocolate: '🍫', cookie: '🍪', candy: '🍬', milk: '🥛', coffee: '☕', tea: '🍵', juice: '🧃', sandwich: '🥪', salad: '🥗', rice: '🍚', butter: '🧈', meat: '🥩', fish: '🐟',
  dog: '🐶', cat: '🐱', bird: '🐦', horse: '🐴', cow: '🐄', pig: '🐷', sheep: '🐑', rabbit: '🐰', mouse: '🐭', monkey: '🐒', lion: '🦁', tiger: '🐯', bear: '🐻', snake: '🐍', frog: '🐸', bee: '🐝', butterfly: '🦋',
  car: '🚗', bus: '🚌', taxi: '🚕', train: '🚆', truck: '🚚', boat: '⛵', ship: '🚢', 'airplane/aeroplane': '✈️', bicycle: '🚲', subway: '🚇',
  book: '📖', pen: '🖊️', pencil: '✏️', key: '🔑', clock: '⏰', umbrella: '☂️', camera: '📷', computer: '💻', 'mobile phone': '📱', telephone: '☎️', television: '📺', radio: '📻', guitar: '🎸', piano: '🎹', drum: '🥁', gift: '🎁', bag: '👜', hat: '🎩', cap: '🧢', 'T-shirt/tee-shirt': '👕', dress: '👗', shoe: '👞', jeans: '👖', glasses: '👓', coat: '🧥', bed: '🛏️', chair: '🪑', door: '🚪', window: '🪟', toilet: '🚽', shower: '🚿', knife: '🔪', box: '📦', bell: '🔔', map: '🗺️', money: '💵', ticket: '🎟️', newspaper: '📰', notebook: '📓', ruler: '📏', ribbon: '🎀',
  soccer: '⚽', basketball: '🏀', baseball: '⚾', tennis: '🎾', volleyball: '🏐',
  rose: '🌹', flower: '🌸', tree: '🌳', leaf: '🍃', sun: '☀️', moon: '🌙', star: '⭐', cloud: '☁️', rain: '🌧️', snow: '❄️', fire: '🔥', ice: '🧊', mountain: '⛰️', island: '🏝️', beach: '🏖️', sea: '🌊',
  house: '🏠', school: '🏫', hospital: '🏥', bank: '🏦', hotel: '🏨', church: '⛪', factory: '🏭', camp: '⛺',
  baby: '👶', boy: '👦', girl: '👧', man: '👨', woman: '👩', king: '🤴', princess: '👸', ghost: '👻', 'doctor/Dr./Dr': '🧑‍⚕️', teacher: '🧑‍🏫', farmer: '🧑‍🌾', student: '🧑‍🎓', cop: '👮',
  eye: '👁️', ear: '👂', nose: '👃', mouth: '👄', hand: '✋', leg: '🦵', tooth: '🦷', brain: '🧠', heart: '❤️', bone: '🦴', kiss: '💋', birthday: '🎂', movie: '🎬', music: '🎵',
  red: '🔴', green: '🟢', blue: '🔵', yellow: '🟡', purple: '🟣', brown: '🟤', black: '⚫', white: '⚪',
  one: '1️⃣', two: '2️⃣', three: '3️⃣', four: '4️⃣', five: '5️⃣', six: '6️⃣', seven: '7️⃣', eight: '8️⃣', nine: '9️⃣', ten: '🔟',
}

const emojiByLowerTerm = new Map(Object.entries(emojiByTerm).map(([term, emoji]) => [term.toLocaleLowerCase(), emoji]))

export function knownEnglishEmoji(term: string) { return emojiByLowerTerm.get(term.toLocaleLowerCase()) ?? null }
