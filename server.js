const path = require("path");

// Require the fastify framework and instantiate it
const fastify = require("fastify")({
  // Set this to true for detailed logging:
  logger: false,
});

const mongoose = require('mongoose');
const dotenv=require('dotenv');

mongoose.set('strictQuery', false);
const autopopulate = require('mongoose-autopopulate');
dotenv.config();
mongoose.connect("mongodb+srv://tgbotsoft:Inf978764@cluster0.hnqzhaj.mongodb.net/shop?retryWrites=true&w=majority");
//
mongoose.Promise = global.Promise;

mongoose.connection.on('error', console.error.bind(console, 'MongoDB connection error:'));
const Schema = mongoose.Schema;
const Types = mongoose.Types;
const model=mongoose.model;

let Orders_schema = new Schema({
    orderDate: Date,
    client: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Clients',
        autopopulate: true
    },
    item: [{
        product: {
            type: Schema.Types.ObjectId,
            ref: 'Prices',
            autopopulate: true
        },
        volume: Number,                 // Литры
    }],
    appendix: String
});
Orders_schema.plugin(autopopulate);

Orders_schema.statics.findByClientAndDate = async function (id, date) {
    return this.find({ client: Types.ObjectId(id), orderDate: date });
}
Orders_schema.statics.findOneByClientAndDate = async function (id, date) {
    return await this.findOne({ 'client': id, 'orderDate': date });
}
Orders_schema.statics.findBySalerAndDate = async function (id, date) {
    let goods = model('Prices').find({ 'saler': id, 'active': true });
    return await this.find({ 'item': { $in: goods }, 'orderDate': date });
}

let client_schema = new Schema({
    login: {
        type: String,
        unique: true,
        required: true
    },
    password: String,
    fullName: {
        type: String,
        unique: true,
        required: true
    },
    phone: String,
    town: String,
    street: String,
    house: String,
    entrance: String,
    appartment: String,
    addition: String,                // код домофона 
    role: {
        type: String,
        enum: ['buyer', 'saler'],
        default: 'buyer',
        requred: true
    }
});

client_schema.virtual('fullAddress')
    .get(function () {
        return `${this.town}, ${this.street}, д. ${this.house}`
            + (!this.entrance ? "" : `, подъезд ${this.entrance} `)
            + (!this.appartment ? "" : `, кв. ${this.appartment}`)
            + (!this.addition ? "" : `, ${this.addition}`).trim();
    });

let price_schema = new Schema({
    product: {
        type: String,
        trim: true
    },
    price: Number,
    active: {
        type: Boolean,
        default: true
    },
    client: { // продавец
        type: Schema.Types.ObjectId,
        ref: 'Clients',
        autopopulate: true
    }
});

price_schema.statics.pricesBySaler = async function (saler) {
    return this.find({ client: Types.ObjectId(saler) });
}

price_schema.statics.toAssociativeArray = async function () {
    let ret = {};
    let p = await this.find({ active: true });
    p.forEach(item => {
        ret[item._id] = item;
        // ret[item.product] = item;
    });
    return ret;
};

const Orders = model('Orders', Orders_schema);
const Prices = model('Prices', price_schema);
const Clients = model('Clients', client_schema);

// ADD FAVORITES ARRAY VARIABLE FROM TODO HERE

// Setup our static files
fastify.register(require("@fastify/static"), {
  root: path.join(__dirname, "public"),
  prefix: "/", // optional: default '/'
});

// Formbody lets us parse incoming forms
fastify.register(require("@fastify/formbody"));

// View is a templating manager for fastify
fastify.register(require("@fastify/view"), {
  engine: {
    handlebars: require("handlebars"),
  },
});

// Load and parse SEO data
const seo = require("./src/seo.json");
if (seo.url === "glitch-default") {
  seo.url = `https://${process.env.PROJECT_DOMAIN}.glitch.me`;
}

/**
 * Our home page route
 *
 * Returns src/pages/index.hbs with data built into it
 */
fastify.get("/", function (request, reply) {
  // params is an object we'll pass to our handlebars template
  let params = { seo: seo };

  // If someone clicked the option for a random color it'll be passed in the querystring
  if (request.query.randomize) {
    // We need to load our color data file, pick one at random, and add it to the params
    const colors = require("./src/colors.json");
    const allColors = Object.keys(colors);
    let currentColor = allColors[(allColors.length * Math.random()) << 0];

    // Add the color properties to the params object
    params = {
      color: colors[currentColor],
      colorError: null,
      seo: seo,
    };
  }

  // The Handlebars code will be able to access the parameter values and build them into the page
  return reply.view("/index.html", params);
});

/**
 * Our POST route to handle and react to form submissions
 *
 * Accepts body data indicating the user choice
 */
fastify.post("/", function (request, reply) {
  // Build the params object to pass to the template
  let params = { seo: seo };

  // If the user submitted a color through the form it'll be passed here in the request body
  let color = request.body.color;

  // If it's not empty, let's try to find the color
  if (color) {
    // ADD CODE FROM TODO HERE TO SAVE SUBMITTED FAVORITES

    // Load our color data file
    const colors = require("./src/colors.json");

    // Take our form submission, remove whitespace, and convert to lowercase
    color = color.toLowerCase().replace(/\s/g, "");

    // Now we see if that color is a key in our colors object
    if (colors[color]) {
      // Found one!
      params = {
        color: colors[color],
        colorError: null,
        seo: seo,
      };
    } else {
      // No luck! Return the user value as the error property
      params = {
        colorError: request.body.color,
        seo: seo,
      };
    }
  }

  // The Handlebars template will use the parameter values to update the page with the chosen color
  return reply.view("/src/pages/index.hbs", params);
});

fastify.post("/userprofile", async function (q, r){
    let { salerId, role, login, password, FullName, phone, town, street, house, entrance, appartment, addition, volume, pail, appendix } = q.body;
    let client = salerId ? await Clients.findById(salerId) : null;
    if (!client) { // клиент не существует создаем его
        client = new Clients();
        client.login = login;
        client.password = password;
        client.fullName = FullName;
        client.phone = phone;
        client.town = town;
        client.street = street;
        client.house = house;
        client.entrance = entrance;
        client.appartment = appartment;
        client.addition = addition;
        client.role = role == 'on' ? 'saler' : 'buyer';
        await client.save();
    }
    // выбор действий в зависимости от роли пользователя
    if (client.role === 'buyer') {
        let order = await Orders.findOne({ 'orderDate': getSatuгDay(new Date()), 'client': client._id });
        let P = await Prices.toAssociativeArray();
        r.render('orderM', { saler: client?._id, order: order, prices: P });
        // r.render('order', { saler: client._id, order: order, prices: P });
    } else {
        let orders = await Orders.find({ orderDate: getSatuгDay(new Date()) }).sort('-volume');
        r.render('DispNextOrders', { 'saler': client._id, 'date': getSatuгDay(new Date()).toLocaleDateString(), 'orders': orders });
    }

  // r.send ({hello:'world'});
});

// Run the server and report out to the logs
fastify.listen(
  { port: process.env.PORT, host: "0.0.0.0" },
  async function (err, address) {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`Your app is listening on ${address}`);
  }
);

function getSatuгDay(date) {
    let d = new Date(date);
    let dayNumber = d.getDay();
    let r = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dayNumber + 6);
    return r;
}
