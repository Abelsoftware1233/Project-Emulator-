/**
 * ECHO AI - SNES EMULATOR CORE (Simplified)
 */

class SNES {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.imageData = this.ctx.createImageData(256, 224);
        
        // Geheugen (128KB WRAM + ROM ruimte)
        this.ram = new Uint8Array(0x20000); 
        this.rom = null;
        
        // CPU Registers
        this.pc = 0;
        this.a = 0; // Accumulator
        this.status = 0;
        this.running = false;
    }

    vibrate(ms = 40) {
        if (navigator.vibrate) navigator.vibrate(ms);
    }

    loadROM(data) {
        this.rom = new Uint8Array(data);
        // Reset Vector: SNES leest startadres uit 0xFFFC in bank 0
        this.pc = (this.rom[0x7FFD] << 8) | this.rom[0x7FFC]; 
        if(this.pc < 0x8000) this.pc = 0x8000; // Fallback
        this.running = true;
        this.vibrate(100);
        this.mainLoop();
    }

    // CPU Instructie Decoder
    step() {
        if (!this.rom) return;
        
        // Simpel voorbeeld van fetch-decode-execute
        const opcode = this.rom[this.pc % this.rom.length];
        this.pc++;

        switch(opcode) {
            case 0xA9: // LDA Immediate
                this.a = this.rom[this.pc++];
                break;
            case 0x8D: // STA Absolute
                this.pc += 2; // Sla adres over in deze demo
                break;
            // Meer opcodes toevoegen voor volledige emulatie...
        }
    }

    // PPU: Teken pixels naar canvas
    render() {
        const data = this.imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            // Genereer "ruis" als er geen game draait, anders zwart
            const color = this.running ? 0 : Math.random() * 50;
            data[i] = color;     // R
            data[i+1] = color;   // G
            data[i+2] = color;   // B
            data[i+3] = 255;     // Alpha
        }
        this.ctx.putImageData(this.imageData, 0, 0);
    }

    mainLoop() {
        if (!this.running) return;
        
        // Voer een aantal cycli uit per frame
        for(let i = 0; i < 1000; i++) {
            this.step();
        }
        
        this.render();
        requestAnimationFrame(() => this.mainLoop());
    }
}

// Initialisatie
const snes = new SNES('screen');

// UI Koppelingen
document.getElementById('rom-input').addEventListener('change', (e) => {
    const reader = new FileReader();
    reader.onload = (event) => {
        snes.loadROM(event.target.result);
        document.getElementById('osd').innerText = "ROM LOADED: RUNNING";
    };
    reader.readAsArrayBuffer(e.target.files[0]);
});

document.querySelectorAll('.ctrl-btn').forEach(btn => {
    btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        snes.vibrate(30);
        console.log("Input:", btn.dataset.key);
    });
});

document.getElementById('power-btn').addEventListener('click', () => {
    location.reload(); // Hard reset
});

// Render eerste frame (zwart scherm)
snes.render();
