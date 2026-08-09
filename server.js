const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Conexión a MongoDB Atlas optimizada
const MONGO_URI = process.env.MONGO_URI;
mongoose.connect(MONGO_URI, {
    family: 4,
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 45000,
})
.then(async () => {
    console.log('Conectado a MongoDB Atlas con éxito');
    const count = await Cuenta.countDocuments();
    if (count === 0) {
        await Cuenta.create({
            banco: 'Banco de Venezuela (0102)',
            tipoCuenta: 'VES',
            numeroCuenta: '01020613810000317201',
            telefonoPagoMovil: '04124489363',
            cedula: '18274410',
            titular: 'Harold Eliezer Galea Sanchez'
        });
    }
})
.catch(err => console.error('Error conectando a MongoDB:', err));

const CuentaSchema = new mongoose.Schema({
    banco: { type: String, required: true },
    tipoCuenta: { type: String, default: 'VES' },
    numeroCuenta: { type: String, required: true },
    telefonoPagoMovil: { type: String, required: true },
    cedula: { type: String, required: true },
    titular: { type: String, required: true }
});
const Cuenta = mongoose.model('Cuenta', CuentaSchema);

const ComprobanteSchema = new mongoose.Schema({
    referencia: { type: String, required: true, unique: true },
    monto: { type: Number, required: true },
    nombreCliente: { type: String, required: true },
    telefono: { type: String, required: true },
    cuentaDestino: { type: String },
    fecha: { type: Date, default: Date.now }
});
const Comprobante = mongoose.model('Comprobante', ComprobanteSchema);

const ClienteSchema = new mongoose.Schema({
    nombre: { type: String, required: true },
    telefono: { type: String, required: true, unique: true },
    saldo: { type: Number, default: 0 },
    historial: [{
        tipo: String,
        monto: Number,
        descripcion: String,
        fecha: { type: Date, default: Date.now }
    }]
});
const Cliente = mongoose.model('Cliente', ClienteSchema);

app.get('/api/cuentas', async (req, res) => {
    try {
        const cuentas = await Cuenta.find();
        res.json(cuentas);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/cuentas', async (req, res) => {
    try {
        const nuevaCuenta = new Cuenta(req.body);
        await nuevaCuenta.save();
        res.json({ status: 'exito', cuenta: nuevaCuenta });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/cuentas/:id', async (req, res) => {
    try {
        await Cuenta.findByIdAndDelete(req.params.id);
        res.json({ status: 'exito' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/guardar-pago', async (req, res) => {
    try {
        const { referencia, monto, nombreCliente, telefono, cuentaDestino } = req.body;
        
        if (!referencia || !nombreCliente || !telefono) {
            return res.status(400).json({ status: 'error', message: 'Faltan datos obligatorios.' });
        }

        const existe = await Comprobante.findOne({ referencia: referencia.trim() });
        if (existe) {
            return res.status(400).json({
                status: 'duplicado',
                message: `¡ALERTA! Referencia ya usada por ${existe.nombreCliente} (Tel: ${existe.telefono}).`
            });
        }

        const montoNum = parseFloat(String(monto).replace(/\./g, '').replace(',', '.'));
        const montoFinal = isNaN(montoNum) ? 0 : montoNum;

        const nuevoComprobante = new Comprobante({ 
            referencia: referencia.trim(), 
            monto: montoFinal, 
            nombreCliente: nombreCliente.trim(), 
            telefono: telefono.trim(),
            cuentaDestino: cuentaDestino || 'Principal'
        });
        await nuevoComprobante.save();

        let cliente = await Cliente.findOne({ telefono: telefono.trim() });
        if (!cliente) {
            cliente = new Cliente({ 
                nombre: nombreCliente.trim(), 
                telefono: telefono.trim(), 
                saldo: montoFinal, 
                historial: [] 
            });
        } else {
            cliente.saldo += montoFinal;
            cliente.nombre = nombreCliente.trim();
        }
        
        cliente.historial.push({ tipo: 'PAGO', monto: montoFinal, descripcion: `Pago ref: ${referencia}` });
        await cliente.save();

        res.json({ status: 'exito', message: '¡Guardado y saldo acreditado con éxito!' });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ status: 'duplicado', message: '¡Esta referencia ya se encuentra registrada!' });
        }
        res.status(500).json({ status: 'error', message: error.message });
    }
});

app.get('/api/clientes', async (req, res) => {
    try {
        const clientes = await Cliente.find().sort({ nombre: 1 });
        res.json(clientes);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/cliente/transaccion', async (req, res) => {
    try {
        const { clienteId, tipo, monto, descripcion } = req.body;
        const cliente = await Cliente.findById(clienteId);
        if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

        const montoNum = parseFloat(monto);
        if (isNaN(montoNum) || montoNum <= 0) return res.status(400).json({ error: 'Monto inválido' });

        if (tipo === 'JUGADA' || tipo === 'RETIRO') {
            cliente.saldo -= montoNum;
        } else if (tipo === 'PREMIO' || tipo === 'PAGO') {
            cliente.saldo += montoNum;
        }

        cliente.historial.push({ tipo, monto: montoNum, descripcion: descripcion || tipo });
        await cliente.save();
        res.json({ status: 'exito', cliente });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));
