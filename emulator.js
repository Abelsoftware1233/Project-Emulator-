/**
 * ECHO AI - SNES EMULATOR CORE (HACK MODE ENABLED)
 */

class SNES {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.imageData = this.ctx.createImageData(256, 224);
        
        this.ram = new Uint8Array(0x20000); 
        this.vram = new Uint8Array(0x10000);
        this.rom = null;
        
        this.pc = 0;
        this.running = false;
        this.hackOffset = 0; // Voor het handmatig 'scannen' door de ROM data

        this.m7 = { a: 256, b: 0, c: 0, d: 256, x: 128, y: 112, hoffset: 0, voffset: 0 };
        this.initInput();
    }

    // --- HACK MODE LOGICA ---
    // Deze functie 'forced' de renderer om data te lezen, zelfs als de CPU crasht
    autoScan() {
        if (this.buttons.right) this.hackOffset += 1024;
        if (this.buttons.left) this.hackOffset -= 1024;
        if (this.buttons.up) this.m7.a += 5;
        if (this.buttons.down) this.m7.a -= 5;
    }

    loadROM(data) {
        this.rom = new Uint8Array(data);
        this.running = true;
        document.getElementById('osd').innerText = "HACK MODE ACTIVE: USE DPAD TO SCAN";
        this.start();
    }

    // Verbeterde Mode 7 Renderer met Data-Injection
    render() {
        const screenData = this.imageData.data;
        const { a, b, c, d, x, y } = this.m7;

        for (let sY = 0; sY < 224; sY++) {
            for (let sX = 0; sX < 256; sX++) {
                // Matrix transformatie
                const rX = sX - x;
                const rY = sY - y;

                const pX = ((a * rX + b * rY) >> 8) + x;
                const pY = ((c * rX + d * rY) >> 8) + y;

                // HACK: We lezen direct uit de ROM op basis van de berekende coordinaten + onze scan-offset
                const dataIndex = Math.abs(this.hackOffset + (pY * 256 + pX)) % this.rom.length;
                const pixelValue = this.rom[dataIndex];

                const i = (sY * 256 + sX) * 4;
                
                // SNES kleurenpalet simulatie (8-bit naar RGB)
                screenData[i]     = (pixelValue & 0xE0);      // R
                screenData[i + 1] = (pixelValue & 0x1C) << 3; // G
                screenData[i + 2] = (pixelValue & 0x03) << 6; // B
                screenData[i + 3] = 255;
            }
        }
        this.ctx.putImageData(this.imageData, 0, 0);
    }

    start() {
        const frame = () => {
            if (!this.running) return;
            this.autoScan(); // Check voor input om door de ROM te 'scrollen'
            this.render();
            requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
    }

    initInput() {
        this.buttons = { left: false, right: false, up: false, down: false };
        document.querySelectorAll('.ctrl-btn').forEach(btn => {
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.buttons[btn.dataset.key] = true;
            });
            btn.addEventListener('touchend', () => {
                this.buttons[btn.dataset.key] = false;
            });
        });
    }
}

const snes = new SNES('screen');
document.getElementById('rom-input').addEventListener('change', (e) => {
    const reader = new FileReader();
    reader.onload = (ev) => snes.loadROM(ev.target.result);
    reader.readAsArrayBuffer(e.target.files[0]);
});
