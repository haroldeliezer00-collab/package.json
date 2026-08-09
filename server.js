const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Conexión a MongoDB Atlas con la URI que acabamos de crear
const MONGO_URI = process.env.MONGO_URI;
mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('Conectado a MongoDB Atlas con éxito'))
.catch(err => console.error('Error conectando a MongoDB:', err));

// Esquema del Comprobante (Anti-Duplicados)
const ComprobanteSchema = new mongoose.Schema({
    referencia: { type: String, required: true, unique: true },
    monto: { type: Number, required: true },
    nombreCliente: { type: String, required: true },
    telefono: { type: String, required: true },
    fecha: { type: Date, default: Date.now }
});

const Comprobante = mongoose.model('Comprobante', ComprobanteSchema);

// Ruta para verificar y guardar comprobante
app.post('/api/verificar-comprobante', async (req, res) => {
    try {
        const { textoComprobante, nombreCliente, telefono } = req.body;

        if (!textoComprobante) {
            return res.status(400).json({ status: 'error', message: 'El texto del comprobante está vacío.' });
        }

        // Extracción automática de referencia y monto
        const refMatch = textoComprobante.match(/ref(?:erencia)?[:\s#]*(\d{4,10})/i) || textoComprobante.match(/(\d{6,10})/);
        const montoMatch = textoComprobante.match(/(?:bs\.?|bolivares|mt)\s*([\d\.,]+)/i) || textoComprobante.match(/([\d\.]+(?:,\d{2})?)/);

        if (!refMatch) {
            return res.status(400).json({ status: 'error', message: 'No se pudo detectar el número de referencia automáticamente.' });
        }

        const referenciaEncontrada = refMatch[1];
        const montoEncontrado = montoMatch ? montoMatch[1] : "0.00";

        // VERIFICACIÓN EN LA NUBE (Anti-Duplicados)
        const existe = await Comprobante.findOne({ referencia: referenciaEncontrada });
        if (existe) {
            return res.status(400).json({
                status: 'duplicado',
                message: `¡ALERTA! Referencia usada por ${existe.nombreCliente} el día ${new Date(existe.fecha).toLocaleDateString()} (Tel: ${existe.telefono}).`
            });
        }

        // Si se envían los datos finales para guardar
        if (nombreCliente && telefono) {
            const montoNum = parseFloat(montoEncontrado.replace(/\./g, '').replace(',', '.'));
            const nuevoComprobante = new Comprobante({
                referencia: referenciaEncontrada,
                monto: isNaN(montoNum) ? 0 : montoNum,
                nombreCliente,
                telefono
            });
            await nuevoComprobante.save();
            return res.json({ status: 'exito', message: 'Comprobante verificado y guardado con éxito.' });
        }

        // Si solo se analizó para rellenar campos en pantalla
        res.json({
            status: 'analizado',
            referencia: referenciaEncontrada,
            monto: montoEncontrado
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ status: 'duplicado', message: '¡Esta referencia ya se encuentra registrada en la base de datos!' });
        }
        res.status(500).json({ status: 'error', message: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));
