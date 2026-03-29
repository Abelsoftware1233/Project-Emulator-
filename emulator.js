/**
 * ECHO SNES EMULATOR CORE
 */

class SNESCPU {
    constructor() {
        this.pc = 0x8000; // Program Counter
        this.a = 0;       // Accumulator (16-bit)
        this.x = 0;       // Index Register X
        this.y = 0;       // Index Register Y
        this.p = 0x30;    // Processor Status
        this.sp = 0x01FF; // Stack Pointer
        this.memory = new Uint8Array(0x1000000); // 16MB Adresruimte
    }

    reset() {
        this.pc = (this.memory[0xFFFD] << 8) | this.memory[0xFFFC];
        console.log("CPU Reset. PC at:", this.pc.toString(16));
    }

    // De core decoder
    step() {
        const opcode = this.memory[this.pc++];
        
        switch(opcode) {
            case 0x18: // CLC (Clear Carry)
                this.p &= ~0x01;
                return 2;
            
            case 0x38: // SEC (Set Carry)
                this.p |= 0x01;
                return 2;

            case 0xA9: // LDA Immediate (8-bit sim)
                this.a = this.memory[this.pc++];
                this.updateFlags(this.a);
                return 2;

            case 0x8D: // STA Absolute
                const low = this.memory[this.pc++];
                const high = this.memory[this.pc++];
                const addr = (high << 8) | low;
                this.memory[addr] = this.a & 0xFF;
                return 4;

            case 0x4C: // JMP Absolute
                const l = this.memory[this.pc++];
                const h = this.memory[this.pc++];
                this.pc = (h << 8) | l;
                return 3;

            default:
                // Fallback voor onbekende opcodes
                return 1;
        }
    }

    updateFlags(val) {
        if ((val & 0xFF) === 0) this.p |= 0x02; else this.p &= ~0x02; // Zero
        if (val & 0x80) this.p |= 0x80; else this.p &= ~0x80;        // Negative
    }
}

// --- UI & Systeem Integratie ---

const canvas = document.getElementById('snes-screen');
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');
const cpu = new SNESCPU();

// Trillingsfunctie
function vibrate(ms = 40) {
    if ("vibrate" in navigator) {
        navigator.vibrate(ms);
    }
}

// Event Listeners voor Knoppen
document.querySelectorAll('.btn').forEach(btn => {
    btn.addEventListener('touchstart', (e) => {
        vibrate(30);
        // Hier kun je input-logica toevoegen (bijv. cpu.setButtonDown(e.target.dataset.key))
    });
    btn.addEventListener('click', () => {
        if (!("ontouchstart" in window)) vibrate(30); // Alleen trillen bij klik op desktop als touch niet bestaat
    });
});

// ROM Laden
document.getElementById('rom-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const data = new Uint8Array(event.target.result);
            // Laad ROM in geheugen (Bank 00 in dit versimpelde voorbeeld)
            for(let i=0; i<data.length; i++) cpu.memory[0x8000 + i] = data[i];
            
            status.innerText = `Loaded: ${file.name}`;
            vibrate(100);
            cpu.reset();
        };
        reader.readAsArrayBuffer(file);
    }
});

document.getElementById('start-btn').addEventListener('click', () => {
    status.innerText = "Running...";
    // Start loop: setInterval(() => cpu.step(), 1);
});
