/**
 * ECHO AI - SNES EMULATOR CORE (MOBILE OPTIMIZED)
 * Geoptimaliseerd voor .sfc bestanden en mobiele performance.
 */

class SNES {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d', { alpha: false });
        this.imageData = this.ctx.createImageData(256, 224);
        
        this.rom = null;
        this.running = false;
        this.hackOffset = 0;

        // Mode 7 Parameters voor de visuele scan
        this.m7 = { a: 256, b: 0, c: 0, d: 256, x: 128, y: 112 };
        
        this.buttons = { 
            left: false, right: false, up: false, down: false, 
            a: false, b: false, x: false, y: false 
        };

        this.initInput();
        this.initFileLoader();
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    // Zorgt dat het canvas scherp blijft en past op mobiele schermen
    resizeCanvas() {
        const container = this.canvas.parentElement;
        if (!container) return;
        const scale = Math.min(container.clientWidth / 256, container.clientHeight / 224);
        this.canvas.style.width = `${256 * scale}px`;
        this.canvas.style.height = `${224 * scale}px`;
    }

    // Input loader voor het .sfc bestand
    initFileLoader() {
        const fileInput = document.getElementById('rom-upload');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        this.loadROM(event.target.result);
                    };
                    reader.readAsArrayBuffer(file);
                }
            });
        }
    }

    loadROM(data) {
        this.rom = new Uint8Array(data);
        this.running = true;
        this.hackOffset = 0;
        console.log("ROM geladen:", this.rom.length, "bytes");
        this.updateOSD("STATUS: RUNNING - " + (this.rom.length / 1024).toFixed(0) + "KB");
        this.start();
    }

    autoScan() {
        if (!this.running || !this.rom) return;

        const speed = 4096; 
        if (this.buttons.right) this.hackOffset += speed;
        if (this.buttons.left) this.hackOffset -= speed;
        
        // Zoom functionaliteit via Up/Down
        if (this.buttons.up) this.m7.a = Math.max(8, this.m7.a - 8);
        if (this.buttons.down) this.m7.a = Math.min(2048, this.m7.a + 8);

        if (this.hackOffset < 0) this.hackOffset = 0;
        if (this.hackOffset > this.rom.length) this.hackOffset = this.rom.length - 1;
    }

    updateOSD(text) {
        const osd = document.getElementById('osd');
        if (osd) osd.innerText = text;
    }

    render() {
        const data = this.imageData.data;
        const rom = this.rom;
        const len = rom.length;
        const { a, b, c, d, x, y } = this.m7;
        const offset = this.hackOffset;

        for (let sY = 0; sY < 224; sY++) {
            const rY = sY - y;
            const rowOffset = sY * 1024; 

            for (let sX = 0; sX < 256; sX++) {
                const rX = sX - x;

                // Mode 7 matrix transformatie voor het scrapen van ROM data
                const pX = ((a * rX + b * rY) >> 8) + x;
                const pY = ((c * rX + d * rY) >> 8) + y;

                const dataIndex = Math.abs(offset + (pY << 8) + pX) % len;
                const pixelValue = rom[dataIndex];

                const i = rowOffset + (sX << 2);
                
                // RGB332 naar RGBA8888 mapping
                data[i]     = (pixelValue & 0xE0);      
                data[i + 1] = (pixelValue & 0x1C) << 3; 
                data[i + 2] = (pixelValue & 0x03) << 6; 
                data[i + 3] = 255;                      
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

    initInput() {
        const preventDefault = (e) => { if (e.cancelable) e.preventDefault(); };

        const handle = (key, isDown) => {
            if (this.buttons.hasOwnProperty(key)) {
                this.buttons[key] = isDown;
                if (isDown && window.navigator.vibrate) {
                    window.navigator.vibrate(15); 
                }
            }
        };

        document.querySelectorAll('.ctrl-btn').forEach(btn => {
            const key = btn.dataset.key;
            btn.addEventListener('touchstart', (e) => { preventDefault(e); handle(key, true); }, { passive: false });
            btn.addEventListener('touchend', (e) => { preventDefault(e); handle(key, false); }, { passive: false });
        });
    }
}

// Initialisatie
const snes = new SNES('screen');
