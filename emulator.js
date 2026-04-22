/**
 * SNES FSC Emulator – emulator.js
 * Full SNES emulation core in JavaScript
 * Supports .fsc, .smc, .sfc, .rom, .bin ROM files
 *
 * Architecture:
 *  - CPU: WDC 65816 (16-bit)
 *  - PPU: Pixel Processing Unit (tile rendering, sprites, backgrounds)
 *  - APU: Audio Processing Unit (SPC700 stub)
 *  - Memory: 24-bit address bus with bank mapping
 *  - Input: Controller 1 & 2
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════════════

function toast(msg, type = 'info', duration = 2800) {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

function setStatus(text) {
  const el = document.getElementById('status-text');
  if (el) el.textContent = text;
}

function setFPS(fps) {
  const el = document.getElementById('fps-counter');
  if (el) el.textContent = fps + ' FPS';
}

// ═══════════════════════════════════════════════════════════════
//  MEMORY BUS
// ═══════════════════════════════════════════════════════════════

class Memory {
  constructor() {
    this.rom        = null;
    this.wram       = new Uint8Array(0x20000);   // 128 KB
    this.sram       = new Uint8Array(0x8000);    // 32 KB SRAM (battery)
    this.vram       = new Uint8Array(0x10000);   // 64 KB VRAM
    this.cgram      = new Uint8Array(0x200);     // 512 B CGRAM (palette)
    this.oam        = new Uint8Array(0x220);     // OAM
    this.apu_regs   = new Uint8Array(4);
    this.open_bus   = 0;
    this.headerOffset = 0;
  }

  loadROM(data) {
    // Detect header offset (512 B copier header)
    this.headerOffset = (data.length & 0x7FFF) === 0x200 ? 0x200 : 0;
    this.rom = new Uint8Array(data.buffer || data, this.headerOffset);
    return this.detectMapping();
  }

  detectMapping() {
    // Check LoROM vs HiROM
    const lorom = this.rom[0x7FD5];
    const hirom = this.rom[0xFFD5];
    // Simple heuristic
    this.hirom = ((hirom & 0x01) !== 0 && (hirom & 0xFE) === 0x20);
    return {
      title:  this.getTitle(),
      hirom:  this.hirom,
      size:   this.rom.length
    };
  }

  getTitle() {
    const offset = this.hirom ? 0xFFC0 : 0x7FC0;
    let title = '';
    for (let i = 0; i < 21; i++) {
      const c = this.rom[offset + i];
      if (c >= 0x20 && c < 0x7F) title += String.fromCharCode(c);
    }
    return title.trim() || 'UNKNOWN GAME';
  }

  read(bank, addr) {
    bank &= 0xFF;
    addr &= 0xFFFF;

    // System area
    if (addr < 0x2000) {
      return this.wram[addr];
    }

    // Hardware registers
    if (addr >= 0x2100 && addr <= 0x21FF) {
      return this.readHWReg(addr);
    }
    if (addr >= 0x4016 && addr <= 0x4017) {
      return this.readJoypad(addr);
    }
    if (addr >= 0x4200 && addr <= 0x42FF) {
      return this.readCPUReg(addr);
    }

    // WRAM mirror
    if (bank >= 0x7E && bank <= 0x7F) {
      return this.wram[((bank - 0x7E) << 16) | addr];
    }

    // ROM
    return this.readROM(bank, addr);
  }

  write(bank, addr, val) {
    bank &= 0xFF;
    addr &= 0xFFFF;
    val  &= 0xFF;

    if (addr < 0x2000) {
      this.wram[addr] = val;
      return;
    }

    if (addr >= 0x2100 && addr <= 0x21FF) {
      this.writeHWReg(addr, val);
      return;
    }

    if (bank >= 0x7E && bank <= 0x7F) {
      this.wram[((bank - 0x7E) << 16) | addr] = val;
      return;
    }

    // SRAM
    if (this.hirom && bank >= 0x20 && bank <= 0x3F && addr >= 0x6000) {
      this.sram[((bank - 0x20) << 13) | (addr & 0x1FFF)] = val;
    }
    if (!this.hirom && bank >= 0x70 && bank <= 0x7D) {
      this.sram[((bank - 0x70) << 15) | addr] = val;
    }
  }

  readROM(bank, addr) {
    if (!this.rom) return this.open_bus;
    let offset;
    if (this.hirom) {
      offset = ((bank & 0x3F) << 16) | addr;
    } else {
      // LoROM
      if (addr < 0x8000) return this.open_bus;
      offset = ((bank & 0x7F) << 15) | (addr & 0x7FFF);
    }
    if (offset >= this.rom.length) return this.open_bus;
    return this.rom[offset];
  }

  // ── Hardware registers (PPU, APU) ──────────────────────────
  readHWReg(addr) {
    if (addr >= 0x2134 && addr <= 0x2137) return 0; // Math
    if (addr === 0x2138) return this.oam_read();
    if (addr === 0x2139 || addr === 0x213A) return this.vram_read(addr);
    if (addr === 0x213B) return this.cgram_read();
    if (addr >= 0x2140 && addr <= 0x2143) return this.apu_regs[addr - 0x2140];
    return this.open_bus;
  }

  writeHWReg(addr, val) {
    if (addr >= 0x2140 && addr <= 0x2143) {
      this.apu_regs[addr - 0x2140] = val;
    }
    // Forward to PPU
    if (window.snesEmu) window.snesEmu.ppu.writeReg(addr, val);
  }

  oam_read()  { return 0; }
  vram_read() { return 0; }
  cgram_read(){ return 0; }

  readJoypad(addr) {
    if (window.snesEmu) return window.snesEmu.input.read(addr);
    return 0;
  }
  readCPUReg(addr) { return 0; }
}

// ═══════════════════════════════════════════════════════════════
//  65816 CPU
// ═══════════════════════════════════════════════════════════════

class CPU65816 {
  constructor(mem) {
    this.mem = mem;
    this.reset();
  }

  reset() {
    // Registers
    this.A  = 0;        // Accumulator (16 bit in native mode)
    this.X  = 0;        // Index X
    this.Y  = 0;        // Index Y
    this.S  = 0x01FF;   // Stack pointer
    this.D  = 0;        // Direct page
    this.DB = 0;        // Data bank
    this.PB = 0;        // Program bank
    this.PC = 0;        // Program counter
    // Status flags
    this.P = 0x34;      // N V M X D I Z C
    // Emulation mode (65C02 compat)
    this.E  = 1;
    // Internal
    this.cycles = 0;
    this.halted  = false;
    this.waiting  = false;

    if (this.mem.rom) {
      this.PC = this.mem.read(0, 0xFFFC) | (this.mem.read(0, 0xFFFD) << 8);
    }
  }

  // ── Flag helpers ────────────────────────────────────────────
  get flag_N() { return (this.P >> 7) & 1; }
  get flag_V() { return (this.P >> 6) & 1; }
  get flag_M() { return this.E ? 1 : (this.P >> 5) & 1; } // acc 8-bit
  get flag_X() { return this.E ? 1 : (this.P >> 4) & 1; } // idx 8-bit
  get flag_D() { return (this.P >> 3) & 1; }
  get flag_I() { return (this.P >> 2) & 1; }
  get flag_Z() { return (this.P >> 1) & 1; }
  get flag_C() { return this.P & 1; }

  setNZ(val, bit16) {
    const mask = bit16 ? 0xFFFF : 0xFF;
    const sign = bit16 ? 0x8000 : 0x80;
    val &= mask;
    if (val & sign) this.P |= 0x80; else this.P &= ~0x80;
    if (val === 0)  this.P |= 0x02; else this.P &= ~0x02;
    return val;
  }

  // ── Read/Write helpers ───────────────────────────────────────
  rb(bank, addr) { return this.mem.read(bank, addr); }
  wb(bank, addr, val) { this.mem.write(bank, addr, val); }

  fetch() {
    const v = this.rb(this.PB, this.PC);
    this.PC = (this.PC + 1) & 0xFFFF;
    return v;
  }
  fetch16() { return this.fetch() | (this.fetch() << 8); }
  fetch24() { return this.fetch() | (this.fetch() << 8) | (this.fetch() << 16); }

  push(val) {
    this.wb(0, this.S, val & 0xFF);
    this.S = (this.S - 1) & (this.E ? 0x01FF : 0xFFFF);
    if (this.E) this.S = 0x0100 | (this.S & 0xFF);
  }
  push16(val) { this.push((val >> 8) & 0xFF); this.push(val & 0xFF); }

  pop() {
    this.S = (this.S + 1) & (this.E ? 0x01FF : 0xFFFF);
    if (this.E) this.S = 0x0100 | (this.S & 0xFF);
    return this.rb(0, this.S);
  }
  pop16() { const lo = this.pop(); return lo | (this.pop() << 8); }

  // ── Addressing modes ────────────────────────────────────────
  addr_Imm()   { const a = this.PC; this.PC += this.flag_M ? 1 : 2; return { bank:this.PB, addr:a }; }
  addr_ImmX()  { const a = this.PC; this.PC += this.flag_X ? 1 : 2; return { bank:this.PB, addr:a }; }
  addr_Dp()    { return { bank:0, addr:(this.D + this.fetch()) & 0xFFFF }; }
  addr_Abs()   { return { bank:this.DB, addr:this.fetch16() }; }
  addr_AbsL()  { const lo=this.fetch16(), bk=this.fetch(); return { bank:bk, addr:lo }; }
  addr_DpX()   { return { bank:0, addr:(this.D + this.fetch() + this.X) & 0xFFFF }; }
  addr_DpY()   { return { bank:0, addr:(this.D + this.fetch() + this.Y) & 0xFFFF }; }
  addr_AbsX()  { return { bank:this.DB, addr:(this.fetch16() + this.X) & 0xFFFF }; }
  addr_AbsY()  { return { bank:this.DB, addr:(this.fetch16() + this.Y) & 0xFFFF }; }
  addr_Rel()   { const off = this.fetch(); return (this.PC + (off < 0x80 ? off : off - 0x100)) & 0xFFFF; }
  addr_RelL()  { const off = this.fetch16(); return (this.PC + (off < 0x8000 ? off : off - 0x10000)) & 0xFFFF; }

  readAM(am) {
    if (this.flag_M) return this.rb(am.bank, am.addr);
    return this.rb(am.bank, am.addr) | (this.rb(am.bank, (am.addr+1)&0xFFFF) << 8);
  }
  writeAM(am, val) {
    this.wb(am.bank, am.addr, val & 0xFF);
    if (!this.flag_M) this.wb(am.bank, (am.addr+1)&0xFFFF, (val>>8)&0xFF);
  }
  readAMX(am) {
    if (this.flag_X) return this.rb(am.bank, am.addr);
    return this.rb(am.bank, am.addr) | (this.rb(am.bank, (am.addr+1)&0xFFFF) << 8);
  }

  // ── Main step: execute one instruction ──────────────────────
  step() {
    if (this.halted) { this.cycles += 2; return; }

    const op = this.fetch();
    const m8 = this.flag_M;
    const x8 = this.flag_X;
    const mask = m8 ? 0xFF : 0xFFFF;
    const xmask = x8 ? 0xFF : 0xFFFF;

    switch (op) {
      // ── Load / Store ──────────────────────────────────────
      case 0xA9: { const v=this.readAM(this.addr_Imm());  this.A=this.setNZ(v,!m8); this.cycles+=m8?2:3; break; }
      case 0xA5: { const v=this.readAM(this.addr_Dp());   this.A=this.setNZ(v,!m8); this.cycles+=3; break; }
      case 0xAD: { const v=this.readAM(this.addr_Abs());  this.A=this.setNZ(v,!m8); this.cycles+=4; break; }
      case 0xBD: { const v=this.readAM(this.addr_AbsX()); this.A=this.setNZ(v,!m8); this.cycles+=4; break; }
      case 0xB9: { const v=this.readAM(this.addr_AbsY()); this.A=this.setNZ(v,!m8); this.cycles+=4; break; }
      case 0xAF: { const v=this.readAM(this.addr_AbsL()); this.A=this.setNZ(v,!m8); this.cycles+=5; break; }

      case 0xA2: { const v=this.readAMX(this.addr_ImmX()); this.X=this.setNZ(v,!x8); this.cycles+=x8?2:3; break; }
      case 0xA0: { const v=this.readAMX(this.addr_ImmX()); this.Y=this.setNZ(v,!x8); this.cycles+=x8?2:3; break; }
      case 0xA6: { const v=this.readAMX(this.addr_Dp());  this.X=this.setNZ(v,!x8); this.cycles+=3; break; }
      case 0xA4: { const v=this.readAMX(this.addr_Dp());  this.Y=this.setNZ(v,!x8); this.cycles+=3; break; }
      case 0xAE: { const v=this.readAMX(this.addr_Abs()); this.X=this.setNZ(v,!x8); this.cycles+=4; break; }
      case 0xAC: { const v=this.readAMX(this.addr_Abs()); this.Y=this.setNZ(v,!x8); this.cycles+=4; break; }

      case 0x85: { this.writeAM(this.addr_Dp(),  this.A); this.cycles+=3; break; }
      case 0x8D: { this.writeAM(this.addr_Abs(), this.A); this.cycles+=4; break; }
      case 0x9D: { this.writeAM(this.addr_AbsX(), this.A); this.cycles+=5; break; }
      case 0x99: { this.writeAM(this.addr_AbsY(), this.A); this.cycles+=5; break; }
      case 0x8F: { this.writeAM(this.addr_AbsL(), this.A); this.cycles+=5; break; }
      case 0x86: { this.writeAM(this.addr_Dp(),  this.X); this.cycles+=3; break; }
      case 0x8E: { this.writeAM(this.addr_Abs(), this.X); this.cycles+=4; break; }
      case 0x84: { this.writeAM(this.addr_Dp(),  this.Y); this.cycles+=3; break; }
      case 0x8C: { this.writeAM(this.addr_Abs(), this.Y); this.cycles+=4; break; }

      // ── Transfers ────────────────────────────────────────
      case 0xAA: this.X = this.setNZ(this.A & xmask, !x8); this.cycles+=2; break; // TAX
      case 0xA8: this.Y = this.setNZ(this.A & xmask, !x8); this.cycles+=2; break; // TAY
      case 0x8A: this.A = this.setNZ(this.X & mask, !m8);  this.cycles+=2; break; // TXA
      case 0x98: this.A = this.setNZ(this.Y & mask, !m8);  this.cycles+=2; break; // TYA
      case 0x9A: this.S = this.X; this.cycles+=2; break; // TXS
      case 0xBA: this.X = this.setNZ(this.S & xmask, !x8); this.cycles+=2; break; // TSX
      case 0x9B: this.Y = this.setNZ(this.X, !x8); this.cycles+=2; break; // TXY
      case 0xBB: this.X = this.setNZ(this.Y, !x8); this.cycles+=2; break; // TYX
      case 0x5B: this.D = this.A; this.cycles+=2; break; // TCD
      case 0x7B: this.A = this.D; this.cycles+=2; break; // TDC
      case 0x1B: this.S = this.A; this.cycles+=2; break; // TCS
      case 0x3B: this.A = this.S; this.cycles+=2; break; // TSC

      // ── Arithmetic ───────────────────────────────────────
      case 0x69: { const v=this.readAM(this.addr_Imm());  this.adc(v); this.cycles+=m8?2:3; break; }
      case 0x65: { const v=this.readAM(this.addr_Dp());   this.adc(v); this.cycles+=3; break; }
      case 0x6D: { const v=this.readAM(this.addr_Abs());  this.adc(v); this.cycles+=4; break; }
      case 0x7D: { const v=this.readAM(this.addr_AbsX()); this.adc(v); this.cycles+=4; break; }

      case 0xE9: { const v=this.readAM(this.addr_Imm());  this.sbc(v); this.cycles+=m8?2:3; break; }
      case 0xE5: { const v=this.readAM(this.addr_Dp());   this.sbc(v); this.cycles+=3; break; }
      case 0xED: { const v=this.readAM(this.addr_Abs());  this.sbc(v); this.cycles+=4; break; }

      // ── Logic ────────────────────────────────────────────
      case 0x29: { const v=this.readAM(this.addr_Imm());  this.A=this.setNZ(this.A & v,!m8); this.cycles+=m8?2:3; break; } // AND
      case 0x09: { const v=this.readAM(this.addr_Imm());  this.A=this.setNZ(this.A | v,!m8); this.cycles+=m8?2:3; break; } // ORA
      case 0x49: { const v=this.readAM(this.addr_Imm());  this.A=this.setNZ(this.A ^ v,!m8); this.cycles+=m8?2:3; break; } // EOR
      case 0x25: { const v=this.readAM(this.addr_Dp());   this.A=this.setNZ(this.A & v,!m8); this.cycles+=3; break; }
      case 0x2D: { const v=this.readAM(this.addr_Abs());  this.A=this.setNZ(this.A & v,!m8); this.cycles+=4; break; }
      case 0x0D: { const v=this.readAM(this.addr_Abs());  this.A=this.setNZ(this.A | v,!m8); this.cycles+=4; break; }
      case 0x4D: { const v=this.readAM(this.addr_Abs());  this.A=this.setNZ(this.A ^ v,!m8); this.cycles+=4; break; }

      // ── Shifts ───────────────────────────────────────────
      case 0x0A: { const c=(this.A>>(m8?7:15))&1; this.A=this.setNZ((this.A<<1)&mask,!m8); if(c) this.P|=1; else this.P&=~1; this.cycles+=2; break; } // ASL A
      case 0x4A: { const c=this.A&1; this.A=this.setNZ(this.A>>(m8?0:0),!m8); this.A=((this.A)>>1)&mask; this.setNZ(this.A,!m8); if(c) this.P|=1; else this.P&=~1; this.cycles+=2; break; } // LSR A
      case 0x2A: { const old_c=this.flag_C; const c=(this.A>>(m8?7:15))&1; this.A=((this.A<<1)|old_c)&mask; this.setNZ(this.A,!m8); if(c) this.P|=1; else this.P&=~1; this.cycles+=2; break; } // ROL A
      case 0x6A: { const old_c=this.flag_C; const c=this.A&1; this.A=((this.A>>1)|(old_c<<(m8?7:15)))&mask; this.setNZ(this.A,!m8); if(c) this.P|=1; else this.P&=~1; this.cycles+=2; break; } // ROR A

      // ── Compare ──────────────────────────────────────────
      case 0xC9: { const v=this.readAM(this.addr_Imm()); this.cmp(this.A,v,mask,!m8); this.cycles+=m8?2:3; break; }
      case 0xC5: { const v=this.readAM(this.addr_Dp());  this.cmp(this.A,v,mask,!m8); this.cycles+=3; break; }
      case 0xCD: { const v=this.readAM(this.addr_Abs()); this.cmp(this.A,v,mask,!m8); this.cycles+=4; break; }
      case 0xDD: { const v=this.readAM(this.addr_AbsX());this.cmp(this.A,v,mask,!m8); this.cycles+=4; break; }
      case 0xD9: { const v=this.readAM(this.addr_AbsY());this.cmp(this.A,v,mask,!m8); this.cycles+=4; break; }
      case 0xE0: { const v=this.readAMX(this.addr_ImmX());this.cmp(this.X,v,xmask,!x8); this.cycles+=x8?2:3; break; }
      case 0xC0: { const v=this.readAMX(this.addr_ImmX());this.cmp(this.Y,v,xmask,!x8); this.cycles+=x8?2:3; break; }
      case 0xE4: { const v=this.readAMX(this.addr_Dp()); this.cmp(this.X,v,xmask,!x8); this.cycles+=3; break; }
      case 0xC4: { const v=this.readAMX(this.addr_Dp()); this.cmp(this.Y,v,xmask,!x8); this.cycles+=3; break; }
      case 0xEC: { const v=this.readAMX(this.addr_Abs());this.cmp(this.X,v,xmask,!x8); this.cycles+=4; break; }
      case 0xCC: { const v=this.readAMX(this.addr_Abs());this.cmp(this.Y,v,xmask,!x8); this.cycles+=4; break; }

      // ── Increment / Decrement ────────────────────────────
      case 0x1A: this.A=(this.A+1)&mask; this.setNZ(this.A,!m8); this.cycles+=2; break; // INC A
      case 0x3A: this.A=(this.A-1)&mask; this.setNZ(this.A,!m8); this.cycles+=2; break; // DEC A
      case 0xE8: this.X=(this.X+1)&xmask; this.setNZ(this.X,!x8); this.cycles+=2; break; // INX
      case 0xCA: this.X=(this.X-1)&xmask; this.setNZ(this.X,!x8); this.cycles+=2; break; // DEX
      case 0xC8: this.Y=(this.Y+1)&xmask; this.setNZ(this.Y,!x8); this.cycles+=2; break; // INY
      case 0x88: this.Y=(this.Y-1)&xmask; this.setNZ(this.Y,!x8); this.cycles+=2; break; // DEY

      case 0xE6: { const am=this.addr_Dp();  const v=(this.readAM(am)+1)&mask; this.writeAM(am,v); this.setNZ(v,!m8); this.cycles+=5; break; }
      case 0xEE: { const am=this.addr_Abs(); const v=(this.readAM(am)+1)&mask; this.writeAM(am,v); this.setNZ(v,!m8); this.cycles+=6; break; }
      case 0xC6: { const am=this.addr_Dp();  const v=(this.readAM(am)-1)&mask; this.writeAM(am,v); this.setNZ(v,!m8); this.cycles+=5; break; }
      case 0xCE: { const am=this.addr_Abs(); const v=(this.readAM(am)-1)&mask; this.writeAM(am,v); this.setNZ(v,!m8); this.cycles+=6; break; }

      // ── Branches ─────────────────────────────────────────
      case 0x90: { const a=this.addr_Rel(); if(!this.flag_C) this.PC=a; this.cycles+=2; break; } // BCC
      case 0xB0: { const a=this.addr_Rel(); if( this.flag_C) this.PC=a; this.cycles+=2; break; } // BCS
      case 0xF0: { const a=this.addr_Rel(); if( this.flag_Z) this.PC=a; this.cycles+=2; break; } // BEQ
      case 0xD0: { const a=this.addr_Rel(); if(!this.flag_Z) this.PC=a; this.cycles+=2; break; } // BNE
      case 0x30: { const a=this.addr_Rel(); if( this.flag_N) this.PC=a; this.cycles+=2; break; } // BMI
      case 0x10: { const a=this.addr_Rel(); if(!this.flag_N) this.PC=a; this.cycles+=2; break; } // BPL
      case 0x70: { const a=this.addr_Rel(); if( this.flag_V) this.PC=a; this.cycles+=2; break; } // BVS
      case 0x50: { const a=this.addr_Rel(); if(!this.flag_V) this.PC=a; this.cycles+=2; break; } // BVC
      case 0x80: { this.PC = this.addr_Rel(); this.cycles+=3; break; } // BRA
      case 0x82: { this.PC = this.addr_RelL(); this.cycles+=4; break; } // BRL

      // ── Jumps ────────────────────────────────────────────
      case 0x4C: { this.PC = this.fetch16(); this.cycles+=3; break; } // JMP abs
      case 0x5C: { const lo=this.fetch16(); this.PB=this.fetch(); this.PC=lo; this.cycles+=4; break; } // JML
      case 0x6C: { const ia=this.fetch16(); this.PC=this.rb(0,ia)|(this.rb(0,(ia+1)&0xFFFF)<<8); this.cycles+=5; break; } // JMP (abs)
      case 0x20: { const a=this.fetch16(); this.push16((this.PC-1)&0xFFFF); this.PC=a; this.cycles+=6; break; } // JSR
      case 0x22: { const lo=this.fetch16(); const bk=this.fetch(); this.push(this.PB); this.push16((this.PC-1)&0xFFFF); this.PB=bk; this.PC=lo; this.cycles+=8; break; } // JSL
      case 0x60: { this.PC=(this.pop16()+1)&0xFFFF; this.cycles+=6; break; } // RTS
      case 0x6B: { this.PC=(this.pop16()+1)&0xFFFF; this.PB=this.pop(); this.cycles+=6; break; } // RTL
      case 0x40: { this.P=this.pop(); this.PC=this.pop16(); if(!this.E) this.PB=this.pop(); this.cycles+=6; break; } // RTI

      // ── Stack ────────────────────────────────────────────
      case 0x48: this.push(m8?this.A:(this.A>>8)&0xFF); if(!m8) this.push(this.A&0xFF); this.cycles+=3; break; // PHA
      case 0x68: this.A=m8?this.pop():this.pop16(); this.setNZ(this.A,!m8); this.cycles+=4; break; // PLA
      case 0xDA: this.push(x8?this.X:(this.X>>8)&0xFF); if(!x8) this.push(this.X&0xFF); this.cycles+=3; break; // PHX
      case 0xFA: this.X=x8?this.pop():this.pop16(); this.setNZ(this.X,!x8); this.cycles+=4; break; // PLX
      case 0x5A: this.push(x8?this.Y:(this.Y>>8)&0xFF); if(!x8) this.push(this.Y&0xFF); this.cycles+=3; break; // PHY
      case 0x7A: this.Y=x8?this.pop():this.pop16(); this.setNZ(this.Y,!x8); this.cycles+=4; break; // PLY
      case 0x08: this.push(this.P); this.cycles+=3; break; // PHP
      case 0x28: this.P=this.pop(); this.cycles+=4; break; // PLP
      case 0x4B: this.push(this.PB); this.cycles+=3; break; // PHB
      case 0xAB: this.DB=this.pop(); this.cycles+=4; break; // PLB
      case 0x0B: this.push16(this.D); this.cycles+=4; break; // PHD
      case 0x2B: this.D=this.pop16(); this.cycles+=5; break; // PLD
      case 0x8B: this.push(this.DB); this.cycles+=3; break; // PHK

      // ── Flag operations ──────────────────────────────────
      case 0x18: this.P &= ~0x01; this.cycles+=2; break; // CLC
      case 0x38: this.P |= 0x01;  this.cycles+=2; break; // SEC
      case 0xD8: this.P &= ~0x08; this.cycles+=2; break; // CLD
      case 0xF8: this.P |= 0x08;  this.cycles+=2; break; // SED
      case 0x58: this.P &= ~0x04; this.cycles+=2; break; // CLI
      case 0x78: this.P |= 0x04;  this.cycles+=2; break; // SEI
      case 0xB8: this.P &= ~0x40; this.cycles+=2; break; // CLV
      case 0xFB: { const tmp=this.E; this.E=this.flag_C; if(tmp) this.P|=1; else this.P&=~1; this.cycles+=2; break; } // XCE
      case 0xC2: { const v=this.fetch(); this.P &= ~v; this.cycles+=3; break; } // REP
      case 0xE2: { const v=this.fetch(); this.P |= v;  this.cycles+=3; break; } // SEP

      // ── Misc ─────────────────────────────────────────────
      case 0xEA: this.cycles+=2; break; // NOP
      case 0x00: { // BRK
        this.fetch(); // padding
        if (!this.E) this.push(this.PB);
        this.push16((this.PC)&0xFFFF);
        this.push(this.P | 0x10);
        this.P |= 0x04;
        if (this.E) this.P |= 0x10;
        this.PB = 0;
        this.PC = this.rb(0,0xFFFE)|(this.rb(0,0xFFFF)<<8);
        this.cycles+=8;
        break;
      }
      case 0xDB: this.halted = true; this.cycles+=3; break; // STP
      case 0xCB: this.waiting = true; this.cycles+=3; break; // WAI
      case 0x42: this.fetch(); this.cycles+=2; break; // WDM (no-op)
      case 0xEB: { const lo=this.A&0xFF; const hi=(this.A>>8)&0xFF; this.A=(lo<<8)|hi; this.setNZ(this.A,true); this.cycles+=3; break; } // XBA
      case 0x44: { const dst=this.fetch(); const src=this.fetch(); // MVN
        this.wb(dst, this.Y, this.rb(src, this.X)); this.X=(this.X+1)&0xFFFF; this.Y=(this.Y+1)&0xFFFF; this.A--; if(this.A!==0xFFFF) this.PC-=3; this.cycles+=7; break; }
      case 0x54: { const dst=this.fetch(); const src=this.fetch(); // MVP
        this.wb(dst, this.Y, this.rb(src, this.X)); this.X=(this.X-1)&0xFFFF; this.Y=(this.Y-1)&0xFFFF; this.A--; if(this.A!==0xFFFF) this.PC-=3; this.cycles+=7; break; }

      default:
        // Unknown opcode — skip
        this.cycles += 2;
        break;
    }
  }

  adc(val) {
    const m8 = this.flag_M;
    const mask = m8 ? 0xFF : 0xFFFF;
    const sign = m8 ? 0x80 : 0x8000;
    const res = this.A + val + this.flag_C;
    if (res > mask) this.P |= 0x01; else this.P &= ~0x01;
    if (~(this.A ^ val) & (this.A ^ res) & sign) this.P |= 0x40; else this.P &= ~0x40;
    this.A = res & mask;
    this.setNZ(this.A, !m8);
  }

  sbc(val) {
    this.adc((~val) & (this.flag_M ? 0xFF : 0xFFFF));
  }

  cmp(reg, val, mask, is16) {
    const res = (reg - val) & mask;
    if (reg >= val) this.P |= 0x01; else this.P &= ~0x01;
    this.setNZ(res, is16);
  }
}

// ═══════════════════════════════════════════════════════════════
//  PPU (Pixel Processing Unit) – simplified tile renderer
// ═══════════════════════════════════════════════════════════════

class PPU {
  constructor(mem, canvas) {
    this.mem    = mem;
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.imageData = this.ctx.createImageData(256, 224);
    this.pixels = new Uint32Array(this.imageData.data.buffer);

    // Registers
    this.bgmode = 0;
    this.bg1sc  = 0; this.bg2sc  = 0;
    this.bg1nba = 0; this.bg2nba = 0;
    this.bg1hofs= 0; this.bg1vofs= 0;
    this.bg2hofs= 0; this.bg2vofs= 0;
    this.inidisp = 0;
    this.objsel  = 0;
    this.oamaddl = 0; this.oamaddh = 0;
    this.oam_internal = 0;
    this.cgadd  = 0; this.cgdata_latch = 0; this.cgdata_first = true;
    this.vmadd  = 0; this.vmain  = 0;
    this.vmd_latch = 0;
    this.rdnmi  = 0;
    this.timeup = 0;
    this.vblank = false;
    this.scanline= 0;
    this.tm = 0xFF; // main screen designation

    this.palette = new Uint32Array(256); // RGBA palette cache
    this.buildTestPalette();
  }

  buildTestPalette() {
    // Simple default palette so something renders even without cgram data
    const defaults = [
      0xFF101010, 0xFFFFFFFF, 0xFF3838FF, 0xFF7C7CFF,
      0xFF940000, 0xFFD82800, 0xFF503000, 0xFF7C4C00,
      0xFF008800, 0xFF00D800, 0xFF00A848, 0xFF00A844,
      0xFF008888, 0xFF000000, 0xFF000000, 0xFF000000,
    ];
    for (let i = 0; i < 256; i++) {
      this.palette[i] = defaults[i % defaults.length];
    }
  }

  writeReg(addr, val) {
    switch(addr) {
      case 0x2100: this.inidisp = val; break;
      case 0x2101: this.objsel  = val; break;
      case 0x2102: this.oamaddl = val; break;
      case 0x2103: this.oamaddh = val; break;
      case 0x2104: this.writeOAM(val); break;
      case 0x2105: this.bgmode = val & 0x07; break;
      case 0x210B: this.bg1nba = val & 0x07; this.bg2nba = (val>>4)&0x07; break;
      case 0x210C: break; // bg3/4 nba
      case 0x210D: this.bg1hofs = (val << 8) | (this.bg1hofs >> 8); break;
      case 0x210E: this.bg1vofs = (val << 8) | (this.bg1vofs >> 8); break;
      case 0x210F: this.bg2hofs = (val << 8) | (this.bg2hofs >> 8); break;
      case 0x2110: this.bg2vofs = (val << 8) | (this.bg2vofs >> 8); break;
      case 0x2107: this.bg1sc = val; break;
      case 0x2108: this.bg2sc = val; break;
      case 0x2115: this.vmain = val; break;
      case 0x2116: this.vmadd = (this.vmadd & 0xFF00) | val; break;
      case 0x2117: this.vmadd = (this.vmadd & 0x00FF) | (val << 8); break;
      case 0x2118: this.mem.vram[this.vmadd * 2] = val; if(!(this.vmain&0x80)) this.vmadd++; break;
      case 0x2119: this.mem.vram[this.vmadd * 2 + 1] = val; if(this.vmain&0x80) this.vmadd++; break;
      case 0x2121: this.cgadd = val; this.cgdata_first = true; break;
      case 0x2122: this.writeCGRAM(val); break;
      case 0x212C: this.tm = val; break;
    }
  }

  writeCGRAM(val) {
    if (this.cgdata_first) {
      this.cgdata_latch = val;
      this.cgdata_first = false;
    } else {
      const color15 = this.cgdata_latch | (val << 8);
      const r = ((color15 & 0x001F) << 3) | ((color15 & 0x001F) >> 2);
      const g = (((color15 >> 5) & 0x1F) << 3) | (((color15 >> 5) & 0x1F) >> 2);
      const b = (((color15 >> 10) & 0x1F) << 3) | (((color15 >> 10) & 0x1F) >> 2);
      this.palette[this.cgadd & 0xFF] = 0xFF000000 | (b << 16) | (g << 8) | r;
      this.cgadd = (this.cgadd + 1) & 0xFF;
      this.cgdata_first = true;
    }
  }

  writeOAM(val) {
    if (this.oam_internal & 1) {
      this.mem.oam[(this.oam_internal >> 1) * 2 + 1] = val;
    } else {
      this.mem.oam[(this.oam_internal >> 1) * 2] = val;
    }
    this.oam_internal++;
  }

  // ── Render one scanline ─────────────────────────────────────
  renderScanline(y) {
    if (this.inidisp & 0x80) {
      // Forced blank
      for (let x = 0; x < 256; x++) this.pixels[y * 256 + x] = 0xFF000000;
      return;
    }

    const bg = this.bgmode & 0x07;
    const baseY = (y + (this.bg1vofs & 0x3FF)) & 0x3FF;

    for (let x = 0; x < 256; x++) {
      const baseX = (x + (this.bg1hofs & 0x3FF)) & 0x3FF;

      // Tile map lookup
      const mapAddr = (this.bg1sc >> 2) << 11;
      const tileX = (baseX >> 3) & 0x1F;
      const tileY = (baseY >> 3) & 0x1F;
      const mapOff = (tileY * 32 + tileX) * 2;
      const lo = this.mem.vram[(mapAddr + mapOff) & 0xFFFF];
      const hi = this.mem.vram[(mapAddr + mapOff + 1) & 0xFFFF];
      const tileNum = lo | ((hi & 0x03) << 8);
      const palette  = (hi >> 2) & 0x07;
      const flipH    = (hi >> 6) & 1;
      const flipV    = (hi >> 7) & 1;

      // Tile data
      let subX = baseX & 7; if (flipH) subX = 7 - subX;
      let subY = baseY & 7; if (flipV) subY = 7 - subY;

      const bitsPerPixel = (bg === 0) ? 2 : (bg <= 2) ? 4 : 8;
      const tileBase = (this.bg1nba << 13);
      const rowOff   = tileNum * bitsPerPixel * 8 + subY * bitsPerPixel;

      let pixel = 0;
      if (bitsPerPixel >= 2) {
        const b0 = this.mem.vram[(tileBase + rowOff) & 0xFFFF] || 0;
        const b1 = this.mem.vram[(tileBase + rowOff + 1) & 0xFFFF] || 0;
        pixel = ((b0 >> (7 - subX)) & 1) | (((b1 >> (7 - subX)) & 1) << 1);
      }
      if (bitsPerPixel >= 4) {
        const b2 = this.mem.vram[(tileBase + rowOff + 16) & 0xFFFF] || 0;
        const b3 = this.mem.vram[(tileBase + rowOff + 17) & 0xFFFF] || 0;
        pixel |= (((b2>>(7-subX))&1)<<2) | (((b3>>(7-subX))&1)<<3);
      }

      if (pixel === 0) {
        this.pixels[y * 256 + x] = this.palette[0]; // transparent → bg color
      } else {
        const palIdx = palette * (1 << bitsPerPixel) + pixel;
        this.pixels[y * 256 + x] = this.palette[palIdx & 0xFF];
      }
    }
  }

  // ── Render sprites (OAM) over BG ───────────────────────────
  renderSprites(y) {
    for (let s = 127; s >= 0; s--) {
      const base = s * 4;
      let sx = this.mem.oam[base];
      const sy = this.mem.oam[base + 1];
      const tile = this.mem.oam[base + 2];
      const attr = this.mem.oam[base + 3];

      if (sy === 0xE0 || sy === 0xEF) continue;

      const flipH = (attr >> 6) & 1;
      const flipV = (attr >> 7) & 1;
      const pal   = (attr >> 1) & 0x07;
      const size  = 8; // simplified: all 8x8

      const dy = (y - sy) & 0xFF;
      if (dy >= size) continue;

      const subY = flipV ? (size - 1 - dy) : dy;
      const tileBase = 0; // OBJ base address

      for (let dx = 0; dx < size; dx++) {
        const px = (sx + dx) & 0xFF;
        if (px >= 256) continue;
        const subX = flipH ? (size - 1 - dx) : dx;
        const b0 = this.mem.vram[(tileBase + tile * 32 + subY * 2) & 0xFFFF] || 0;
        const b1 = this.mem.vram[(tileBase + tile * 32 + subY * 2 + 1) & 0xFFFF] || 0;
        const pixel = ((b0>>(7-subX))&1) | (((b1>>(7-subX))&1)<<1);
        if (pixel !== 0) {
          const palIdx = 128 + pal * 4 + pixel;
          this.pixels[y * 256 + px] = this.palette[palIdx & 0xFF];
        }
      }
    }
  }

  // ── Full frame ──────────────────────────────────────────────
  renderFrame() {
    for (let y = 0; y < 224; y++) {
      this.renderScanline(y);
      this.renderSprites(y);
    }
    this.ctx.putImageData(this.imageData, 0, 0);
  }

  drawBootScreen() {
    const ctx = this.ctx;
    ctx.fillStyle = '#0a1a0a';
    ctx.fillRect(0, 0, 256, 224);
    // Gradient background
    const grd = ctx.createLinearGradient(0,0,0,224);
    grd.addColorStop(0, '#0a2a0a');
    grd.addColorStop(1, '#000a00');
    ctx.fillStyle = grd;
    ctx.fillRect(0,0,256,224);
    // Grid pattern
    ctx.strokeStyle = 'rgba(62,166,62,0.08)';
    ctx.lineWidth = 1;
    for(let x=0;x<256;x+=16){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,224);ctx.stroke();}
    for(let y=0;y<224;y+=16){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(256,y);ctx.stroke();}
    // Logo
    ctx.fillStyle = '#3ea63e';
    ctx.font = 'bold 18px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#52c252';
    ctx.shadowBlur = 12;
    ctx.fillText('SUPER FSC', 128, 90);
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 4;
    ctx.fillText('EMULATOR', 128, 115);
    ctx.font = '6px "Press Start 2P", monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.shadowBlur = 0;
    ctx.fillText('LAAD EEN .FSC ROM', 128, 160);
    ctx.fillText('OM TE BEGINNEN', 128, 176);
    ctx.textAlign = 'left';
  }
}

// ═══════════════════════════════════════════════════════════════
//  INPUT CONTROLLER
// ═══════════════════════════════════════════════════════════════

class Input {
  constructor() {
    // SNES button bits: B Y Sel Start Up Down Left Right A X L R
    this.buttons = [0, 0]; // player 1, player 2
    this.latch   = [0, 0];
    this.pos     = [0, 0];
    this.setupKeyboard();
  }

  setupKeyboard() {
    const map = {
      'ArrowUp':    (1<<4), 'ArrowDown':  (1<<5),
      'ArrowLeft':  (1<<6), 'ArrowRight': (1<<7),
      'z': (1<<0), 'Z': (1<<0),          // B
      'x': (1<<6)|(1<<0), 'X': (1<<6),   // A (x key)
      'a': (1<<9), 'A': (1<<9),          // X button
      'b': (1<<0), 'B': (1<<0),          // B button duplicate
      'y': (1<<4)|(1<<0), 'Y': (1<<1),   // Y button
      'Enter':     (1<<3),                // Start
      'Backspace': (1<<2),                // Select
      'q': (1<<10), 'Q': (1<<10),        // L
      'w': (1<<11), 'W': (1<<11),        // R
    };
    // Remapped cleaner:
    this.keyMap = {
      'ArrowUp':    1<<4, 'ArrowDown':  1<<5,
      'ArrowLeft':  1<<6, 'ArrowRight': 1<<7,
      'z':  1<<0,  // B
      'x':  1<<8,  // A
      'a':  1<<9,  // X
      'y':  1<<1,  // Y (s key avoids conflict)
      'Enter':     1<<3,
      'Backspace': 1<<2,
      'q':  1<<10, // L
      'w':  1<<11, // R
    };
    document.addEventListener('keydown', e => {
      const bit = this.keyMap[e.key];
      if (bit) { this.buttons[0] |= bit; e.preventDefault(); }
    });
    document.addEventListener('keyup', e => {
      const bit = this.keyMap[e.key];
      if (bit) { this.buttons[0] &= ~bit; e.preventDefault(); }
    });
  }

  pressButton(bit, player=0) { this.buttons[player] |= bit; }
  releaseButton(bit, player=0) { this.buttons[player] &= ~bit; }

  strobe(val) {
    if (val & 1) {
      this.latch[0] = this.buttons[0];
      this.latch[1] = this.buttons[1];
      this.pos[0] = 0;
      this.pos[1] = 0;
    }
  }

  read(addr) {
    const p = addr - 0x4016;
    if (p > 1) return 0;
    const bit = (this.latch[p] >> this.pos[p]) & 1;
    this.pos[p] = (this.pos[p] + 1) & 0x0F;
    return bit;
  }
}

// ═══════════════════════════════════════════════════════════════
//  SAVE STATES
// ═══════════════════════════════════════════════════════════════

class SaveState {
  static save(emu, slot) {
    const state = {
      cpu: {
        A:emu.cpu.A, X:emu.cpu.X, Y:emu.cpu.Y,
        S:emu.cpu.S, D:emu.cpu.D, DB:emu.cpu.DB,
        PB:emu.cpu.PB, PC:emu.cpu.PC, P:emu.cpu.P, E:emu.cpu.E
      },
      wram: Array.from(emu.mem.wram),
      sram: Array.from(emu.mem.sram),
    };
    localStorage.setItem(`snes_state_${slot}`, JSON.stringify(state));
    return true;
  }

  static load(emu, slot) {
    const data = localStorage.getItem(`snes_state_${slot}`);
    if (!data) return false;
    const state = JSON.parse(data);
    Object.assign(emu.cpu, state.cpu);
    emu.mem.wram.set(state.wram);
    emu.mem.sram.set(state.sram);
    return true;
  }
}

// ═══════════════════════════════════════════════════════════════
//  MAIN EMULATOR CLASS
// ═══════════════════════════════════════════════════════════════

class SNESEmulator {
  constructor() {
    this.mem    = new Memory();
    this.cpu    = new CPU65816(this.mem);
    this.canvas = document.getElementById('snes-canvas');
    this.ppu    = new PPU(this.mem, this.canvas);
    this.input  = new Input();

    this.running   = false;
    this.paused    = false;
    this.romLoaded = false;
    this.speed     = 1;
    this.currentSlot = 1;

    this.frameCount = 0;
    this.lastFPSTime = performance.now();
    this.cyclesPerFrame = 1364 * 262; // ~21.47 MHz / 60 fps
    this.cycleAcc = 0;

    this.animFrame = null;

    this.ppu.drawBootScreen();
    this.setupUI();
  }

  // ── ROM loading ─────────────────────────────────────────────
  loadROM(data, filename) {
    const info = this.mem.loadROM(data);
    this.cpu.reset();

    const title = info.title || filename.replace(/\.[^.]+$/, '');
    document.getElementById('game-title').textContent = title;
    document.title = title + ' – SNES FSC';

    const kib = (data.length / 1024).toFixed(0);
    setStatus(`${title} | ${info.hirom ? 'HiROM' : 'LoROM'} | ${kib} KiB`);
    toast(`▶ ${title} geladen!`, 'info');

    this.romLoaded = true;
    document.getElementById('overlay').classList.add('hidden');
    this.start();
  }

  // ── Emulation loop ──────────────────────────────────────────
  start() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    this.running = true;
    this.paused  = false;
    this.loop();
  }

  loop() {
    if (!this.running) return;
    this.animFrame = requestAnimationFrame(() => this.loop());
    if (this.paused) return;

    const cyclesToRun = (this.cyclesPerFrame * this.speed) | 0;

    for (let i = 0; i < cyclesToRun; i++) {
      this.cpu.step();
    }

    this.ppu.renderFrame();

    // FPS counter
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFPSTime >= 1000) {
      setFPS(this.frameCount);
      this.frameCount = 0;
      this.lastFPSTime = now;
    }
  }

  pause() {
    this.paused = !this.paused;
    document.getElementById('btn-pause').textContent = this.paused ? '▶ RESUME' : '⏸ PAUSE';
    toast(this.paused ? '⏸ Gepauzeerd' : '▶ Hervat');
  }

  reset() {
    if (!this.romLoaded) return;
    this.cpu.reset();
    toast('↺ Reset');
  }

  // ── Save / Load ─────────────────────────────────────────────
  saveState() {
    if (!this.romLoaded) { toast('Geen ROM geladen', 'warning'); return; }
    SaveState.save(this, this.currentSlot);
    toast(`💾 Opgeslagen in slot ${this.currentSlot}`);
  }

  loadState() {
    if (!this.romLoaded) { toast('Geen ROM geladen', 'warning'); return; }
    const ok = SaveState.load(this, this.currentSlot);
    toast(ok ? `📂 Slot ${this.currentSlot} geladen` : `⚠ Geen opslag in slot ${this.currentSlot}`, ok ? 'info' : 'warning');
  }

  cycleSpeed() {
    const speeds = [1, 2, 4, 0.5];
    const labels = ['×1', '×2', '×4', '×½'];
    this.speed = speeds[(speeds.indexOf(this.speed) + 1) % speeds.length];
    document.getElementById('btn-speed').textContent = `⚡ ${labels[speeds.indexOf(this.speed)]}`;
    toast(`Snelheid: ${labels[speeds.indexOf(this.speed)]}`);
  }

  // ── UI setup ─────────────────────────────────────────────────
  setupUI() {
    // File inputs
    ['rom-input', 'rom-input2'].forEach(id => {
      document.getElementById(id).addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
          this.loadROM(new Uint8Array(ev.target.result), file.name);
        };
        reader.readAsArrayBuffer(file);
        e.target.value = '';
      });
    });

    document.getElementById('btn-save-state').addEventListener('click', () => this.saveState());
    document.getElementById('btn-load-state').addEventListener('click', () => this.loadState());
    document.getElementById('btn-reset').addEventListener('click', () => this.reset());
    document.getElementById('btn-pause').addEventListener('click', () => this.pause());
    document.getElementById('btn-speed').addEventListener('click', () => this.cycleSpeed());

    document.getElementById('btn-mute').addEventListener('click', () => {
      toast('🔇 Audio: APU stub (geen geluid)','warning');
    });

    document.getElementById('btn-fullscreen').addEventListener('click', () => {
      const el = document.querySelector('.console-shell');
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        el.requestFullscreen().catch(() => toast('Volledig scherm niet beschikbaar', 'warning'));
      }
    });

    // Slot selection
    document.querySelectorAll('.slot-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentSlot = parseInt(btn.dataset.slot);
        toast(`Slot ${this.currentSlot} geselecteerd`);
      });
    });

    // On-screen D-pad
    const dpadBtns = {
      'ArrowUp': 1<<4, 'ArrowDown': 1<<5,
      'ArrowLeft': 1<<6, 'ArrowRight': 1<<7
    };
    document.querySelectorAll('.dpad-btn[data-key]').forEach(btn => {
      const bit = dpadBtns[btn.dataset.key];
      if (!bit) return;
      const press = () => { this.input.pressButton(bit); btn.classList.add('pressed'); };
      const release = () => { this.input.releaseButton(bit); btn.classList.remove('pressed'); };
      btn.addEventListener('pointerdown', press);
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointerleave', release);
    });

    // Face buttons
    const faceBits = { 'b':1<<0, 'y':1<<1, 'a':1<<8, 'x':1<<9 };
    document.querySelectorAll('.face-btn[data-key]').forEach(btn => {
      const bit = faceBits[btn.dataset.key];
      if (!bit) return;
      const press = () => { this.input.pressButton(bit); btn.classList.add('pressed'); };
      const release = () => { this.input.releaseButton(bit); btn.classList.remove('pressed'); };
      btn.addEventListener('pointerdown', press);
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointerleave', release);
    });

    // Shoulder buttons
    const shoulderBits = { 'q': 1<<10, 'w': 1<<11 };
    document.querySelectorAll('.shoulder-btn[data-key]').forEach(btn => {
      const bit = shoulderBits[btn.dataset.key];
      if (!bit) return;
      const press = () => { this.input.pressButton(bit); btn.classList.add('pressed'); };
      const release = () => { this.input.releaseButton(bit); btn.classList.remove('pressed'); };
      btn.addEventListener('pointerdown', press);
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointerleave', release);
    });

    // Select / Start
    document.getElementById('btn-select').addEventListener('pointerdown', () => this.input.pressButton(1<<2));
    document.getElementById('btn-select').addEventListener('pointerup',   () => this.input.releaseButton(1<<2));
    document.getElementById('btn-start').addEventListener('pointerdown',  () => this.input.pressButton(1<<3));
    document.getElementById('btn-start').addEventListener('pointerup',    () => this.input.releaseButton(1<<3));

    // Prevent context menu on controller
    document.querySelector('.controller').addEventListener('contextmenu', e => e.preventDefault());
  }
}

// ═══════════════════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════════════════

window.addEventListener('DOMContentLoaded', () => {
  window.snesEmu = new SNESEmulator();
  console.log('%c SNES FSC Emulator gestart ', 'background:#2d7a2d;color:#fff;font-size:14px;padding:4px 8px;border-radius:4px;');
  console.log('Ondersteunde formaten: .fsc .smc .sfc .rom .bin');
  console.log('Toetsenbord: Pijltjes=D-Pad  Z=B  X=A  A=X  Y=Y  Enter=Start  Backspace=Select  Q=L  W=R');
});
