const path = require("path");
const resolve = require('path').resolve;
const PaymentCode=require('@kiraind/gost-r-56042-2014');

const fastify = require("fastify")({
    // Set this to true for detailed logging:
    logger: false,
});

const mongoose = require('mongoose');
const dotenv = require('dotenv');

mongoose.set('strictQuery', false);
const autopopulate = require('mongoose-autopopulate');
dotenv.config();
mongoose.connect(process.env.MONGO_URL);
//
mongoose.Promise = global.Promise;

mongoose.connection.on('error', console.error.bind(console, 'MongoDB connection error:'));
const Schema = mongoose.Schema;
const Types = mongoose.Types;
const model = mongoose.model;

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
        unique: true
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
    root: path.join(process.cwd(), "public"),
    prefix: "/", // optional: default '/'
});

fastify.register(require("@fastify/formbody"));

fastify.register(require('@fastify/view'), {
    engine: {
        ejs: require('ejs'),
    },
    includeViewExtension: true,
    viewExt: 'ejs',
    root: path.join(process.cwd(), 'views')
})

fastify.get("/", function (request, reply) {
    try{
        return reply.sendFile("index.html");
    }
    catch (err){
        console.log(err);
        return err;
    }
});

// fastify.post("/", function (request, reply) {
//   // Build the params object to pass to the template
//   let params = { seo: seo };

//   // If the user submitted a color through the form it'll be passed here in the request body
//   let color = request.body.color;

//   // If it's not empty, let's try to find the color
//   if (color) {
//     // ADD CODE FROM TODO HERE TO SAVE SUBMITTED FAVORITES

//     // Load our color data file
//     const colors = require("./src/colors.json");

//     // Take our form submission, remove whitespace, and convert to lowercase
//     color = color.toLowerCase().replace(/\s/g, "");

//     // Now we see if that color is a key in our colors object
//     if (colors[color]) {
//       // Found one!
//       params = {
//         color: colors[color],
//         colorError: null,
//         seo: seo,
//       };
//     } else {
//       // No luck! Return the user value as the error property
//       params = {
//         colorError: request.body.color,
//         seo: seo,
//       };
//     }
//   }

//   // The Handlebars template will use the parameter values to update the page with the chosen color
//   return reply.view("/src/pages/index.hbs", params);
// });

fastify.post("/userprofile", async function (q, r) {
    let { salerId, role, login, password, fullName, phone, town, street, house, entrance, appartment, addition } = q.body;
    let client = salerId ? await Clients.findById(salerId) : null;
    if (!client) { // клиент не существует создаем его
        client = new Clients();
        client.login = login;
        client.password = password;
        client.fullName = fullName;
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
        return r.view('orderM', { 'saler': client?._id, 'order': order, 'prices': P });
    } else {
        let orders = await Orders.find({ orderDate: getSatuгDay(new Date()) }).sort('-volume');
        return r.view('DispNextOrders', { 'saler': client._id, 'date': getSatuгDay(new Date()).toLocaleDateString(), 'orders': orders });
    }
});

fastify.post('/saveOrder', async (q, r) => {
    let { clientId, orderId, volume, product, appendix } = q.body;
    let O = (orderId !== '') ? await Orders.findById(orderId) : null;
    if (!O) {
        O = new Orders();
    }
    O.client = clientId;
    for (let i = 0; i < product.length; i++) {
        if (volume[i])
            O.item.push({ product: product[i], volume: volume[i] });
    }
    O.orderDate = getSatuгDay(new Date());
    O.appendix = appendix;
    await O.save();

    //QR
    let P = await Prices.toAssociativeArray();
    let x = 0;
    let orderSumm = O.item.map(i => x += i.volume * P[i.product._id].price).reverse()[0];
    const pngBuffer = await PaymentCode.toDataURL({
        Name: process.env.Firm,
        PersonalAcc: process.env.PersonalAcc,
        CorrespAcc: process.env.CorrespAcc,
        PayeeINN: process.env.PayeeINN,

        BankName: process.env.BankName,
        BIC: process.env.BIC,
        // Name: 'ООО "Три кита"',
        // PersonalAcc: '40702810138250123017',
        // CorrespAcc: '30101810400000000225',
        // PayeeINN: '6200098765',

        // BankName: 'ОАО "БАНК"',
        // BIC: '044525225',

        // LastName: 'Иванов',
        // FirstName: 'Иван',
        // MiddleName: 'Иванович',
        Purpose: `Оплата по счету ${O?._id}`,
        // Purpose: 'Оплата членского взноса',
        // PayerAddress: 'г.Рязань, ул.Ленина, д.10, кв.15',

        Sum: orderSumm
    }, {
        scale: 5,
        errorCorrectionLevel: 'L'
    })
        .then(url => {return r.view('confirmation', {
            order: O, date: getSatuгDay(new Date()).toLocaleDateString(), URL: url, orderSumm: orderSumm
        })})
        .catch(err => {
            console.debug(err)
            return r.status(500).send(err);
        })
    //QR
    // r.render('confirmation', { id: O?._id, date: getSatuгDay(new Date()).toLocaleDateString(), URL: url });
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
