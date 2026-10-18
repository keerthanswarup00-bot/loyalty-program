// Shop types for the Connect page.
// A type sets the words the Connect page uses (Menu / Services / Products) and the sample content
// the owner can drop in while setting up. "cafe" is built out fully; the other types are config-only,
// so adding a new type means adding one entry here — the page and the editor need no code changes.
// Loaded before connect.js and connect-admin.js.
window.VERTICALS = {
  cafe: {
    key: 'cafe', label: 'Cafe or restaurant', schemaType: 'Restaurant',
    section: 'Menu', item: 'item', items: 'items', browse: 'Explore the Menu',
    ask: 'Ask on WhatsApp',
    primary: 'dir',   // the one big button this type leads with: wa | call | dir | col (falls back to what is filled in)
    intro: shop => 'Hi ' + shop + '!',
    orderText: (shop, item) => 'Hi ' + shop + ", I'd like to order: " + item + '.',
    sample: {
      tagline: 'Coffee, bakes and good times.',
      categories: ['Coffee', 'Cold drinks', 'Snacks', 'Desserts'],
      items: [
        { title: 'Filter coffee', price: '₹80', description: 'Freshly brewed, strong and smooth.', category: 'Coffee' },
        { title: 'Masala chai', price: '₹60', description: 'Spiced tea, made the old way.', category: 'Coffee' },
        { title: 'Cold coffee', price: '₹120', description: 'Blended with ice cream and a chocolate drizzle.', category: 'Cold drinks' },
        { title: 'Fresh lime soda', price: '₹70', description: 'Sweet or salted.', category: 'Cold drinks' },
        { title: 'Veg sandwich', price: '₹110', description: 'Toasted, with mint chutney and cheese.', category: 'Snacks' },
        { title: 'Chocolate brownie', price: '₹90', description: 'Warm, fudgy and made in-house.', category: 'Desserts' }
      ]
    }
  },
  bakery: {
    key: 'bakery', label: 'Bakery', schemaType: 'Bakery',
    section: 'Menu', item: 'item', items: 'items', browse: 'See the Menu',
    ask: 'Ask on WhatsApp',
    primary: 'wa',   // the one big button this type leads with: wa | call | dir | col (falls back to what is filled in)
    intro: shop => 'Hi ' + shop + ', I would like to place an order.',
    orderText: (shop, item) => 'Hi ' + shop + ", I'd like to order: " + item + '.',
    sample: {
      tagline: 'Freshly baked, every day.',
      categories: ['Cakes', 'Breads', 'Cookies'],
      items: [
        { title: 'Chocolate truffle cake', price: '₹550 / 500g', description: 'Rich and moist, made to order.', category: 'Cakes' },
        { title: 'Plum cake', price: '₹180', description: 'Soft, spiced and full of fruit.', category: 'Cakes' },
        { title: 'Milk bread loaf', price: '₹45', description: 'Baked fresh every morning.', category: 'Breads' },
        { title: 'Butter cookies', price: '₹120 / 250g', description: 'Crisp and buttery.', category: 'Cookies' }
      ]
    }
  },
  salon: {
    key: 'salon', label: 'Salon or spa', schemaType: 'HairSalon',
    section: 'Services', item: 'service', items: 'services', browse: 'See the Services',
    ask: 'Book on WhatsApp',
    primary: 'wa',   // the one big button this type leads with: wa | call | dir | col (falls back to what is filled in)
    intro: shop => 'Hi ' + shop + ', I would like to book an appointment.',
    orderText: (shop, item) => 'Hi ' + shop + ', I would like to book: ' + item + '.',
    sample: {
      tagline: 'Look good, feel great.',
      categories: ['Hair', 'Skin', 'Nails'],
      items: [
        { title: 'Haircut', price: '₹300', description: 'Wash, cut and blow dry.', category: 'Hair' },
        { title: 'Hair colour', price: '₹1200', description: 'Ammonia-free colour.', category: 'Hair' },
        { title: 'Facial', price: '₹800', description: 'Clean-up with a relaxing massage.', category: 'Skin' },
        { title: 'Manicure', price: '₹450', description: 'Shape, cuticle care and polish.', category: 'Nails' }
      ]
    }
  },
  boutique: {
    key: 'boutique', label: 'Boutique or store', schemaType: 'ClothingStore',
    section: 'Collection', item: 'product', items: 'products', browse: 'See the Collection',
    ask: 'Ask on WhatsApp',
    primary: 'col',   // the one big button this type leads with: wa | call | dir | col (falls back to what is filled in)
    intro: shop => 'Hi ' + shop + ', I have a question about your collection.',
    orderText: (shop, item) => 'Hi ' + shop + ', I am interested in: ' + item + '.',
    sample: {
      tagline: 'Clothes and things you will love.',
      categories: ['New in', 'Everyday', 'Festive'],
      items: [
        { title: 'Cotton kurta', price: '₹899', description: 'Breathable, in five colours.', category: 'Everyday' },
        { title: 'Silk dupatta', price: '₹650', description: 'Hand-block printed.', category: 'Festive' },
        { title: 'Everyday tote bag', price: '₹499', description: 'Roomy and machine washable.', category: 'New in' }
      ]
    }
  },
  repair: {
    key: 'repair', label: 'Repair or service shop', schemaType: 'LocalBusiness',
    section: 'Repairs & services', item: 'service', items: 'services', browse: 'See what we fix',
    ask: 'Ask on WhatsApp',
    primary: 'call',   // the one big button this type leads with: wa | call | dir | col (falls back to what is filled in)
    intro: shop => 'Hi ' + shop + ', I need a repair. Can you help?',
    orderText: (shop, item) => 'Hi ' + shop + ', I need help with: ' + item + '.',
    sample: {
      tagline: 'Fixed fast, done right.',
      categories: ['Devices', 'Appliances'],
      items: [
        { title: 'Phone screen replacement', price: 'from ₹900', description: 'Most models, same day.', category: 'Devices' },
        { title: 'Battery replacement', price: 'from ₹600', description: 'Genuine batteries.', category: 'Devices' },
        { title: 'Washing machine service', price: 'from ₹400', description: 'Home visit available.', category: 'Appliances' }
      ]
    }
  },
  generic: {
    key: 'generic', label: 'Something else', schemaType: 'LocalBusiness',
    section: 'Products & services', item: 'product', items: 'products', browse: 'See what we offer',
    ask: 'Ask on WhatsApp',
    primary: 'wa',   // the one big button this type leads with: wa | call | dir | col (falls back to what is filled in)
    intro: shop => 'Hi ' + shop + '!',
    orderText: (shop, item) => 'Hi ' + shop + ', I am interested in: ' + item + '.',
    sample: {
      tagline: 'Everything we do, in one place.',
      categories: ['Popular'],
      items: [
        { title: 'Sample item', price: '₹100', description: 'Replace this with something you sell.', category: 'Popular' }
      ]
    }
  }
};
// The type for a shop, falling back to "generic" for anything unknown or empty.
window.vertical = k => window.VERTICALS[k] || window.VERTICALS.generic;
