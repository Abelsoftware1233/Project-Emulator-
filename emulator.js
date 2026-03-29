/**
 * ECHO AI - SNES EMULATOR CORE (HACK MODE ENABLED)
 * Gebruik de D-Pad om door ROM-data te scannen.
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
        this.hackOffset = 0; // De huidige positie in de ROM data

        // Mode 7 Parameters (A = Zoom/Schaal)
        this.m7 = { a: 256, b: 0, c: 0, d: 256, x: 128, y: 112, hoffset: 0, voffset: 0 };
        
        this.buttons = { left: false, right: false, up: false, down: false, a: false, b: false, x: false, y: false };
        this.initInput();
    }

    // --- HACK MODE LOGICA ---
    // Update de scan-positie op basis van ingedrukte knoppen
    autoScan() {
        if (!this.running || !this.rom) return;

        // Links/Rechts = Snel door de ROM bladeren
        if (this.buttons.right) this.hackOffset += 2048;
        if (this.buttons.left) this.hackOffset -= 2048;
        
        // Omhoog/Omlaag = In- en uitzoomen (Mode 7 Schaling)
        if (this.buttons.up) this.m7.a = Math.max(10, this.m7.a - 4);
        if (this.buttons.down) this.m7.a = Math.min(2000, this.m7.a + 4);

        // Zorg dat de offset binnen de ROM grenzen blijft
        if (this.hackOffset < 0) this.hackOffset = 0;
        if (this.hackOffset > this.rom.length) this.hackOffset = this.rom.length - 1;
    }

    loadROM(data) {
        this.rom = new Uint8Array(data);
        this.running = true;
        this.hackOffset = 0;
        document.getElementById('osd').innerText = "HACK MODE: ACTIVE";
        this.start();
    }

    // De "Brute Force" Renderer: Vertaalt elke pixel direct naar een ROM-adres
    render() {
        const screenData = this.imageData.data;
        const { a, b, c, d, x, y } = this.m7;

        for (let sY = 0; sY < 224; sY++) {
            for (let sX = 0; sX < 256; sX++) {
                // Bereken pixel transformatie (Mode 7 wiskunde)
                const rX = sX - x;
                const rY = sY - y;

                const pX = ((a * rX + b * rY) >> 8) + x;
                const pY = ((c * rX + d * rY) >> 8) + y;

                // Haal data op uit de ROM op de huidige scan-locatie
                const dataIndex = Math.abs(this.hackOffset + (pY * 256 + pX)) % this.rom.length;
                const pixelValue = this.rom[dataIndex];

                const i = (sY * 256 + sX) * 4;
                
                // Vertaal 8-bit ROM data naar zichtbare RGB kleuren
                screenData[i]     = (pixelValue & 0xE0);      // R
                screenData[i + 1] = (pixelValue & 0x1C) << 3; // G
                screenData[i + 2] = (pixelValue & 0x03) << 6; // B
                screenData[i + 3] = 255;                      // Alpha
            }
        }
        this.ctx.putImageData(this.imageData, 0, 0);
    }

    start() {
        const frame = () => {
            if (!this.running) return;
            this.autoScan();
            this.render();
            requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
    }

    // --- INTERFACE & SAVE STATES ---
    saveState() {
        const state = { offset: this.hackOffset, zoom: this.m7.a };
        localStorage.setItem('snes_hack_state', JSON.stringify(state));
        document.getElementById('osd').innerText = "STATE SAVED";
        setTimeout(() => document.getElementById('osd').innerText = "HACK MODE: ACTIVE", 1500);
    }

    loadState() {
        const saved = localStorage.getItem('snes_hack_state');
        if (saved) {
            const state = JSON.parse(saved);
            this.hackOffset = state.offset;
            this.m7.a = state.zoom;
            document.getElementById('osd').innerText = "STATE LOADED";
        }
    }

    initInput() {
        const handleEvent = (key, isDown) => {
            if (this.buttons.hasOwnProperty(key)) {
                this.buttons[key] = isDown;
                if (isDown && navigator.vibrate) navigator.vibrate(20);
            }
        };

        document.querySelectorAll('.ctrl-btn').forEach(btn => {
            const key = btn.dataset.key;
            btn.addEventListener('touchstart', (e) => { e.preventDefault(); handleEvent(key, true); });
            btn.addEventListener('touchend', () => handleEvent(key, false));
            // Muis ondersteuning voor desktop test
            btn.addEventListener('mousedown', () => handleEvent(key, true));
            btn.addEventListener('mouseup', () => handleEvent(key, false));
        });
    }
}

// Initialisatie
const snes = new SNES('screen');

// ROM Input listener
document.getElementById('rom-input').addEventListener('change', (e) => {
    const reader = new FileReader();
    reader.onload = (ev) => snes.loadROM(ev.target.result);
    reader.readAsArrayBuffer(e.target.files[0]);
});

// Power Button listener
document.getElementById('power-btn').addEventListener('click', () => {
    snes.running = !snes.running;
    if (snes.running) snes.start();
    document.getElementById('osd').innerText = snes.running ? "HACK MODE: ACTIVE" : "POWER OFF";
});
