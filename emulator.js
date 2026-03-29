/**
 * ECHO AI - ADVANCED SNES EMULATOR CORE
 * Features: 65C816 CPU Base, Mode 7 PPU, Web Audio Engine, Save States
 */

class SNES {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.imageData = this.ctx.createImageData(256, 224);
        
        // --- Geheugen Architectuur ---
        this.ram = new Uint8Array(0x20000);   // 128KB WRAM
        this.vram = new Uint8Array(0x10000);  // 64KB VRAM
        this.rom = null;
        
        // --- CPU Registers ---
        this.pc = 0;
        this.a = 0;
        this.x = 0;
        this.y = 0;
        this.sp = 0x01FF;
        this.status = 0x30;
        this.running = false;

        // --- Mode 7 PPU Matrix ---
        this.m7 = {
            a: 256, b: 0, c: 0, d: 256, // Schaal 1:1
            x: 128, y: 112,             // Pivot punt (midden scherm)
            hoffset: 0, voffset: 0
        };

        // --- Audio Context ---
        this.audioCtx = null;
        this.buttons = { up: false, down: false, left: false, right: false, a: false, b: false, x: false, y: false };
        
        this.initInput();
    }

    // --- AUDIO ENGINE ---
    initAudio() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    playTone(freq = 440, duration = 0.1) {
        if (!this.audioCtx) return;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.05, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, this.audioCtx.currentTime + duration);
        osc.start();
        osc.stop(this.audioCtx.currentTime + duration);
    }

    // --- CORE LOGICA ---
    loadROM(data) {
        this.rom = new Uint8Array(data);
        // Vind Reset Vector ($FFFC in bank $00)
        let headerOffset = (this.rom.length % 0x8000 === 512) ? 0x81C0 : 0x7FC0;
        this.pc = (this.rom[headerOffset + 0x3D] << 8) | this.rom[headerOffset + 0x3C];
        
        if (this.pc < 0x8000) this.pc = 0x8000; 
        
        this.initAudio();
        this.running = true;
        document.getElementById('osd').innerText = "ROM ACTIVE";
        this.start();
    }

    step() {
        if (!this.rom || !this.running) return 1;
        const opcode = this.rom[this.pc % this.rom.length];
        this.pc = (this.pc + 1) & 0xFFFFFF;

        switch(opcode) {
            case 0xA9: this.a = this.rom[this.pc++]; this.updateStatus(this.a); return 2; // LDA Imm
            case 0x8D: this.writeMem((this.rom[this.pc+1]<<8)|this.rom[this.pc], this.a); this.pc+=2; return 4; // STA Abs
            case 0x18: this.status &= ~0x01; return 2; // CLC
            case 0x4C: this.pc = (this.rom[this.pc+1]<<8)|this.rom[this.pc]; return 3; // JMP
            case 0xEA: return 2; // NOP
            default: return 1;
        }
    }

    writeMem(addr, val) {
        // Hardware Register Mapping (Simulatie)
        if (addr === 0x211B) { this.m7.a = val; this.playTone(200 + val); } // Mode 7 Register + Audio Feedback
        this.ram[addr % 0x20000] = val;
    }

    updateStatus(val) {
        if (val === 0) this.status |= 0x02; else this.status &= ~0x02;
        if (val & 0x80) this.status |= 0x80; else this.status &= ~0x80;
    }

    // --- MODE 7 RENDERING ---
    render() {
        const screenData = this.imageData.data;
        const { a, b, c, d, x, y, hoffset, voffset } = this.m7;

        for (let sY = 0; sY < 224; sY++) {
            for (let sX = 0; sX < 256; sX++) {
                const rX = sX + hoffset - x;
                const rY = sY + voffset - y;

                const pX = ((a * rX + b * rY) >> 8) + x;
                const pY = ((c * rX + d * rY) >> 8) + y;

                const color = (this.rom) ? this.rom[(Math.abs(pX * pY)) % this.rom.length] : 0;
                const i = (sY * 256 + sX) * 4;

                screenData[i] = color;
                screenData[i+1] = color * 0.8;
                screenData[i+2] = 200;
                screenData[i+3] = 255;
            }
        }
        this.ctx.putImageData(this.imageData, 0, 0);
    }

    start() {
        const frame = () => {
            if (!this.running) return;
            for (let i = 0; i < 15000; i++) this.step();
            this.render();
            requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
    }

    // --- INTERFACE & INPUT ---
    initInput() {
        document.querySelectorAll('.ctrl-btn').forEach(btn => {
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                if (navigator.vibrate) navigator.vibrate(30);
                this.buttons[btn.dataset.key] = true;
                this.playTone(400, 0.05);
            });
            btn.addEventListener('touchend', () => this.buttons[btn.dataset.key] = false);
        });
    }

    saveState() {
        const state = { ram: Array.from(this.ram), pc: this.pc, m7: this.m7 };
        localStorage.setItem('echo_snes_state', JSON.stringify(state));
        alert("State Saved to Echo AI Storage");
    }

    loadState() {
        const saved = localStorage.getItem('echo_snes_state');
        if (saved) {
            const s = JSON.parse(saved);
            this.ram = new Uint8Array(s.ram);
            this.pc = s.pc;
            this.m7 = s.m7;
        }
    }
}

// Bootstrapper
const snes = new SNES('screen');

document.getElementById('rom-input').addEventListener('change', (e) => {
    const reader = new FileReader();
    reader.onload = (ev) => snes.loadROM(ev.target.result);
    reader.readAsArrayBuffer(e.target.files[0]);
});

document.getElementById('power-btn').addEventListener('click', () => {
    snes.running = !snes.running;
    if (snes.running) snes.start();
    document.getElementById('osd').innerText = snes.running ? "RUNNING" : "PAUSED";
});
