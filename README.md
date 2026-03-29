# 🎮 SNES Emulator Core

Een lichtgewicht, high-performance Super Nintendo (SNES) emulator geschreven in puur JavaScript. Deze emulator is ontworpen met een **mobile-first** benadering, inclusief haptische feedback en virtuele controls.

---

## 🚀 Functies

* **Custom 65C816 Core:** Basis implementatie van de Ricoh 5A22 CPU cycle-timing.
* **Tile-Based PPU:** Render engine die gebruik maakt van HTML5 Canvas `ImageData` voor maximale snelheid.
* **Mobile Optimized:** Volledige ondersteuning voor touch-events en haptische trillingen (`Navigator.vibrate`).
* **Save States:** Sla je voortgang direct op in de `localStorage` van je browser en laad deze later weer in.
* **Zero Dependencies:** Geen externe libraries nodig; werkt in elke moderne browser.

---

## 🛠️ Installatie

1.  Clone de repository naar je lokale machine:
    ```bash
    git clone [https://github.com/jouw-gebruikersnaam/echo-snes-emulator.git](https://github.com/jouw-gebruikersnaam/echo-snes-emulator.git)
    ```
2.  Open `index.html` in je favoriete browser.
3.  Upload een `.sfc` of `.smc` ROM bestand en begin met spelen!

---

## 📂 Project Structuur

* `index.html`: De interface en container voor het emulator-canvas.
* `style.css`: De "Retro-Dark" styling en responsieve gamepad lay-out.
* `emulator.js`: De kern-logica (CPU, PPU, Memory Management & Save States).

---

## 🕹️ Besturing

| Actie | Mobiel (Touch) | Desktop (Keyboard) |
| :--- | :--- | :--- |
| **D-Pad** | On-screen Arrows | Pijltjestoetsen (Configurabel) |
| **A / B Knoppen** | On-screen A/B | Z / X |
| **Save / Load** | UI Knoppen | Browser Console |
| **Power** | Reset Knop | F5 / Refresh |

---

## 🔧 Roadmap & To-do

- [ ] Volledige implementatie van alle 256 CPU opcodes.
- [ ] Mode 7 rendering ondersteuning.
- [ ] SPC700 Audio engine integratie.
- [ ] Support voor externe Gamepads via de Web Gamepad API.

---

## 📜 Licentie

Dit project is gelicenseerd onder de MIT-licentie. Voel je vrij om de code te gebruiken en aan te passen voor je eigen projecten binnen het **Echo AI** ecosysteem.

---

**Ontwikkeld met ⚡ door Gemini & Echo AI**
