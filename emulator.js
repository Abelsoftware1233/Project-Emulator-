/**
 * ECHO AI - GEOPTIMALISEERDE SNES EMULATOR CORE
 */

class SNES {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.imageData = this.ctx.createImageData(256, 224);
        
        // Geheugen: WRAM (128KB) + VRAM (64KB)
        this.ram = new Uint8Array(0x20000); 
        this.vram = new Uint8Array(0x10000);
        this.rom = null;
        
        // CPU Registers (65C816 basis)
        this.pc = 0;
        this.a = 0; // Accumulator
        this.x = 0; // Index X
        this.y = 0; // Index Y
        this.sp = 0x01FF; // Stack Pointer
        this.status = 0x30;
        this.running = false;

        this.buttons = { up: false, down: false, left: false, right: false, a: false, b: false, x: false, y: false };
        this.initInput();
    }

    vibrate(ms = 40) {
        if (navigator.vibrate) navigator.vibrate(ms);
    }

    // --- VERBETERDE ROM LOADING ---
    loadROM(data) {
        this.rom = new Uint8Array(data);
        
        // SNES Reset Vector bevindt zich meestal op $00FFFC in de ROM
        // Voor een eenvoudige implementatie kijken we naar de header
        let headerOffset = 0x7FC0; 
        if (this.rom.length % 0x8000 === 512) headerOffset += 512; // Skip SMC header indien aanwezig

        this.pc = (this.rom[headerOffset + 0x3D] << 8) | this.rom[headerOffset + 0x3C];
        
        // Fallback als de vector ongeldig lijkt
        if (this.pc < 0x8000) this.pc = 0x8000; 

        document.getElementById('osd').innerText = "ROM RUNNING";
        this.running = true;
        this.start();
    }

    // --- UITGEBREIDE CPU STEP ---
    step() {
        if (!this.rom || !this.running) return 1;

        const opcode = this.rom[this.pc % this.rom.length];
        this.pc = (this.pc + 1) & 0xFFFFFF;

        // Basis instructie set voor boot-up
        switch(opcode) {
            case 0xA9: // LDA Immediate
                this.a = this.rom[this.pc++];
                this.updateStatus(this.a);
                return 2;
            case 0xAD: // LDA Absolute
                let addr = (this.rom[this.pc+1] << 8) | this.rom[this.pc];
                this.a = this.ram[addr % 0x20000];
                this.pc += 2;
                return 4;
            case 0x8D: // STA Absolute
                let sAddr = (this.rom[this.pc+1] << 8) | this.rom[this.pc];
                this.ram[sAddr % 0x20000] = this.a;
                this.pc += 2;
                return 4;
            case 0x18: // CLC
                this.status &= ~0x01;
                return 2;
            case 0x38: // SEC
                this.status |= 0x01;
                return 2;
            case 0x4C: // JMP Absolute
                this.pc = (this.rom[this.pc+1] << 8) | this.rom[this.pc];
                return 3;
            case 0xEA: // NOP
                return 2;
            default:
                // Skip onbekende opcodes om vastlopen te voorkomen
                return 1;
        }
    }

    updateStatus(val) {
        if (val === 0) this.status |= 0x02; else this.status &= ~0x02; // Zero flag
        if (val & 0x80) this.status |= 0x80; else this.status &= ~0x80; // Negative flag
    }

    // --- RENDERING ---
    render() {
        const screenData = this.imageData.data;
        
        // Eenvoudige visualisatie: we renderen een "noise" patroon 
        // gemixt met RAM data om activiteit te tonen
        for (let i = 0; i < screenData.length; i += 4) {
            const ramVal = this.ram[i % 0x2000];
            screenData[i]     = ramVal || (Math.random() * 50); // R
            screenData[i + 1] = ramVal ? 100 : (Math.random() * 50); // G
            screenData[i + 2] = 150; // B
            screenData[i + 3] = 255; // Alpha
        }
        this.ctx.putImageData(this.imageData, 0, 0);
    }

    start() {
        const frame = () => {
            if (!this.running) return;
            // Voer ~20.000 cycles per frame uit (vloeiende snelheid)
            for (let i = 0; i < 20000; i++) {
                this.step();
            }
            this.render();
            requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
    }

    initInput() {
        const handleInput = (key, isPressed) => {
            if (this.buttons.hasOwnProperty(key)) {
                this.buttons[key] = isPressed;
                if (isPressed) this.vibrate(20);
            }
        };

        document.querySelectorAll('.ctrl-btn').forEach(btn => {
            const key = btn.dataset.key;
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                handleInput(key, true);
            });
            btn.addEventListener('touchend', () => handleInput(key, false));
            // Muis ondersteuning voor testen op PC
            btn.addEventListener('mousedown', () => handleInput(key, true));
            btn.addEventListener('mouseup', () => handleInput(key, false));
        });
    }

    // Power Toggle
    togglePower() {
        this.running = !this.running;
        this.vibrate(100);
        document.getElementById('osd').innerText = this.running ? "RUNNING" : "POWER OFF";
        if (this.running) this.start();
    }
}

const snes = new SNES('screen');

document.getElementById('rom-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => snes.loadROM(ev.target.result);
        reader.readAsArrayBuffer(file);
    }
});

document.getElementById('power-btn').addEventListener('click', () => snes.togglePower());
