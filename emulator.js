/**
 * ECHO AI - SNES EMULATOR CORE (MOBILE OPTIMIZED)
 * Geoptimaliseerd voor touch-bediening en mobiele performance.
 */

class SNES {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d', { alpha: false }); // Performance boost: geen transparantie
        this.imageData = this.ctx.createImageData(256, 224);
        
        this.ram = new Uint8Array(0x20000); 
        this.vram = new Uint8Array(0x10000);
        this.rom = null;
        
        this.pc = 0;
        this.running = false;
        this.hackOffset = 0;

        // Mode 7 Parameters
        this.m7 = { a: 256, b: 0, c: 0, d: 256, x: 128, y: 112 };
        
        this.buttons = { left: false, right: false, up: false, down: false, a: false, b: false, x: false, y: false };
        this.initInput();
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    // Zorgt dat het canvas scherp blijft en past op mobiel
    resizeCanvas() {
        const container = this.canvas.parentElement;
        const scale = Math.min(container.clientWidth / 256, container.clientHeight / 224);
        this.canvas.style.width = `${256 * scale}px`;
        this.canvas.style.height = `${224 * scale}px`;
    }

    autoScan() {
        if (!this.running || !this.rom) return;

        // Versnelling voor mobiele navigatie
        const speed = 4096; 
        if (this.buttons.right) this.hackOffset += speed;
        if (this.buttons.left) this.hackOffset -= speed;
        
        if (this.buttons.up) this.m7.a = Math.max(8, this.m7.a - 8);
        if (this.buttons.down) this.m7.a = Math.min(2048, this.m7.a + 8);

        if (this.hackOffset < 0) this.hackOffset = 0;
        if (this.hackOffset > this.rom.length) this.hackOffset = this.rom.length - 1;
    }

    loadROM(data) {
        this.rom = new Uint8Array(data);
        this.running = true;
        this.hackOffset = 0;
        this.updateOSD("HACK MODE: ACTIVE");
        this.start();
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

        // Cache loop-variabelen voor snelheid
        for (let sY = 0; sY < 224; sY++) {
            const rY = sY - y;
            const rowOffset = sY * 1024; // 256 * 4

            for (let sX = 0; sX < 256; sX++) {
                const rX = sX - x;

                // Mode 7 matrix transformatie
                const pX = ((a * rX + b * rY) >> 8) + x;
                const pY = ((c * rX + d * rY) >> 8) + y;

                const dataIndex = Math.abs(offset + (pY << 8) + pX) % len;
                const pixelValue = rom[dataIndex];

                const i = rowOffset + (sX << 2);
                
                // Directe kleur-mapping (RGB332 naar RGBA8888)
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
                    window.navigator.vibrate(10); // Kortere trilling voor snellere feedback
                }
            }
        };

        // Verbeterde touch-handlers voor mobiel (voorkomt ghost clicks en scrolling)
        document.querySelectorAll('.ctrl-btn').forEach(btn => {
            const key = btn.dataset.key;
            
            btn.addEventListener('touchstart', (e) => {
                preventDefault(e);
                handle(key, true);
            }, { passive: false });

            btn.addEventListener('touchend', (e) => {
                preventDefault(e);
                handle(key, false);
            }, { passive: false });
        });
    }
}

const snes = new SNES('screen');
