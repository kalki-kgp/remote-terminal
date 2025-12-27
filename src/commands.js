import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Store commands in project data directory (persists across installations)
const DATA_DIR = join(__dirname, '../data');
const COMMANDS_FILE = join(DATA_DIR, 'commands.json');

export class CommandManager {
  constructor() {
    this.commands = [];
    this.ensureDataDir();
    this.load();
  }

  ensureDataDir() {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  load() {
    try {
      if (existsSync(COMMANDS_FILE)) {
        const data = readFileSync(COMMANDS_FILE, 'utf-8');
        this.commands = JSON.parse(data);
        console.log(`[Commands] Loaded ${this.commands.length} favorite command(s)`);
      } else {
        // Start with empty list
        this.commands = [];
        this.save();
      }
    } catch (error) {
      console.error('[Commands] Failed to load:', error.message);
      this.commands = [];
    }
  }

  save() {
    try {
      writeFileSync(COMMANDS_FILE, JSON.stringify(this.commands, null, 2));
    } catch (error) {
      console.error('[Commands] Failed to save:', error.message);
    }
  }

  getAll() {
    return this.commands;
  }

  add(label, command) {
    const id = `cmd-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const newCommand = {
      id,
      label: label.trim(),
      command: command.trim(),
      createdAt: new Date().toISOString(),
    };
    this.commands.push(newCommand);
    this.save();
    console.log(`[Commands] Added: ${label}`);
    return newCommand;
  }

  update(id, label, command) {
    const index = this.commands.findIndex(c => c.id === id);
    if (index === -1) {
      throw new Error('Command not found');
    }
    this.commands[index] = {
      ...this.commands[index],
      label: label.trim(),
      command: command.trim(),
      updatedAt: new Date().toISOString(),
    };
    this.save();
    console.log(`[Commands] Updated: ${label}`);
    return this.commands[index];
  }

  delete(id) {
    const index = this.commands.findIndex(c => c.id === id);
    if (index === -1) {
      throw new Error('Command not found');
    }
    const deleted = this.commands.splice(index, 1)[0];
    this.save();
    console.log(`[Commands] Deleted: ${deleted.label}`);
    return deleted;
  }

  reorder(orderedIds) {
    // Reorder based on array of IDs
    const newOrder = [];
    for (const id of orderedIds) {
      const cmd = this.commands.find(c => c.id === id);
      if (cmd) newOrder.push(cmd);
    }
    // Add any commands that weren't in the ordered list
    for (const cmd of this.commands) {
      if (!orderedIds.includes(cmd.id)) {
        newOrder.push(cmd);
      }
    }
    this.commands = newOrder;
    this.save();
  }
}
