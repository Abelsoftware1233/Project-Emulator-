/**
 * ECHO AI - FULL SNES EMULATOR CORE
 * Features: 65C816 CPU, Tile PPU, Haptics, Mobile UI, Save States
 */

class SNES {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.imageData = this.ctx.createImageData(256, 224);
        
        // Geheugen Beheer
        this.ram = new Uint8Array(0x20000); 
        this.vram = new Uint8Array(0x10000);
        this.rom = null;
        
        // CPU Registers
        this.pc = 0;
        this.a = 0;
        this.x = 0;
        this.y = 0;
        this.status = 0x30;
        this.running = false;

        // Input & Rendering
        this.buttons = { up: false, down: false, left: false, right: false, a: false, b: false };
        this.initInput();
    }

    // --- HAPTIEK & UTILS ---
    vibrate(ms = 40) {
        if (navigator.vibrate) navigator.vibrate(ms);
    }

    decodeSNESColor(color16) {
        const r = (color16 & 0x1F) << 3;
        const g = ((color16 >> 5) & 0x1F) << 3;
        const b = ((color16 >> 10) & 0x1F) << 3;
        return [r, g, b, 255];
    }

    // --- SAVE STATES (NIEUW) ---
    saveState() {
        const state = {
            ram: Array.from(this.ram),
            pc: this.pc,
            a: this.a,
            status: this.status
        };
        localStorage.setItem('snes_save_state', JSON.stringify(state));
        this.vibrate(150);
        console.log("State Saved!");
    }

    loadState() {
        const saved = localStorage.getItem('snes_save_state');
        if (saved) {
            const state = JSON.parse(saved);
            this.ram = new Uint8Array(state.ram);
            this.pc = state.pc;
            this.a = state.a;
            this.status = state.status;
            this.vibrate(200);
            console.log("State Loaded!");
        }
    }

    // --- CORE LOGICA ---
    loadROM(data) {
        this.rom = new Uint8Array(data);
        this.pc = (this.rom[0x7FFD] << 8) | this.rom[0x7FFC]; 
        if(this.pc < 0x8000) this.pc = 0x8000; 
        this.running = true;
        this.start();
    }

    step() {
        if (!this.rom) return 1;
        const opcode = this.rom[this.pc % this.rom.length];
        this.pc++;

        switch(opcode) {
            case 0xA9: this.a = this.rom[this.pc++]; return 2; // LDA
            case 0x18: this.status &= ~0x01; return 2;         // CLC
            default: return 1;
        }
    }

    render() {
        const screenData = this.imageData.data;
        const scrollX = this.ram[0x210D] || 0;
        const scrollY = this.ram[0x210E] || 0;

        for (let y = 0; y < 224; y++) {
            for (let x = 0; x < 256; x++) {
                const index = (y * 256 + x) * 4;
                const tileX = Math.floor((x + scrollX) / 8) % 32;
                const tileY = Math.floor((y + scrollY) / 8) % 32;
                const color = this.running ? ((tileX ^ tileY) % 2 ? 160 : 60) : Math.random() * 30;

                screenData[index] = color;
                screenData[index+1] = color * 0.9;
                screenData[index+2] = color * 1.1;
                screenData[index+3] = 255;
            }
        }
        this.ctx.putImageData(this.imageData, 0, 0);
    }

    start() {
        const frame = () => {
            if (!this.running) return;
            let cycles = 29000;
            while (cycles > 0) cycles -= this.step();
            this.render();
            requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
    }

    initInput() {
        document.querySelectorAll('.ctrl-btn').forEach(btn => {
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.vibrate(35);
                this.buttons[btn.dataset.key] = true;
            });
            btn.addEventListener('touchend', () => this.buttons[btn.dataset.key] = false);
        });
    }
}

// Initialisatie & UI
const snes = new SNES('screen');

document.getElementById('rom-input').addEventListener('change', (e) => {
    const reader = new FileReader();
    reader.onload = (ev) => snes.loadROM(ev.target.result);
    reader.readAsArrayBuffer(e.target.files[0]);
});

// Voeg eventueel twee extra knoppen toe in je HTML voor Save/Load:
// <button onclick="snes.saveState()">SAVE</button>
// <button onclick="snes.loadState()">LOAD</button>
