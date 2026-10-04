// ONE FILE PER CLIENT: edit this to brand the site, then bump "version" so
// browsers that already opened the site pick up the new settings.
window.CLIENT = {
  version: 1,
  name: 'Bean & Brew',
  emoji: '',                       // 1-2 letters shown if no logo image (blank = first letter of name)
  logo: '',                        // e.g. 'logo.png' (upload the file to the repo next to index.html)
  color: '#8a4b2a',                // brand colour
  tagline: 'Every cup counts.',
  ig: '', fb: '', wa: '', web: '', // full links starting with https://
  need: 8,                         // stamps needed for the main reward
  reward: 'Free coffee of your choice',
  cooldown: 1, cdUnit: 'm',        // time between stamps: 'm' minutes or 'h' hours
  sat: '3',                        // surprise-offer stamp numbers, e.g. '3,6' (blank = off)
  sOffer: '20% off your next order',
  wOffer: '10% off your next visit',          // welcome offer (blank = off)
  bOffer: 'Free dessert on your birthday',    // birthday offer (blank = off)
  expDays: 30,                     // offers expire after N days (0 = never)
  pin: '1234',                     // owner PIN (demo only, replace before showing clients)
  base: '',                        // live site address for QR, e.g. 'https://cafe.yourdomain.com/'
  token: 'demo1'                   // QR/NFC code; change it to invalidate printed codes
};
