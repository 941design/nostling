### Feature Request – Nostling Relay Manager Redesign + Filesystem Sync

**Title:** Compact, powerful relay manager with per-identity config file sync and overwrite protection

**Status:** New – High Priority  
**Target:** v0.1.0+

#### Core Requirements

1. **Replace current card layout with compact, high-density table/list**  
   - Row height: ≤ 36 px  
   - Columns (in order):  
     Drag handle | ☑ Enabled | Status dot + latency | Relay URL (inline editable) | ☑ Read | ☑ Write | Remove (−)  
   - Supports 12–15 visible rows without scrolling on 13" display  
   - Drag-to-reorder with visible position numbers  
   - Bulk actions bar and “Add relay” inline at bottom

2. **Read / Write policy checkboxes per relay**  
   - Separate ☑ Read and ☑ Write columns (tooltips: “Receive events” / “Publish events”)  
   - Default for new relays: both checked  
     – Public default relays → both enabled  
     – Known archive relays → Read only  
     – Known blast relays → Write only

3. **Live connection status**  
   - Real-time green/yellow/red dot + tooltip with latency or error  
   - Footer summary: “14 relays · 11 connected · 2 failed”

4. **Per-identity config file sync (mandatory)**  
   - Path: `~/.config/nostling/identities/<npub-or-nsec-hash>/relays.json`  
   - File format: clean, pretty-printed JSON array of objects  
     ```json
     [
       { "url": "wss://relay.damus.io",      "read": true,  "write": true,  "order": 0 },
       { "url": "wss://eden.nostr.land",    "read": true,  "write": false, "order": 1 },
       { "url": "wss://nostr.band",         "read": false, "write": true,  "order": 2 }
     ]
     ```
   - All changes (add, remove, reorder, read/write toggle, inline URL edit) immediately write to the file  
   - No “Save Changes” button needed

5. **Overwrite protection via consistency check**  
   Before every write:  
   - Read current file content and compute SHA-256 hash  
   - Compare with hash stored when UI was last loaded/refreshed  
   - If hashes differ → another process or user edited the file  
     → Show modal: “Relay configuration was modified outside Nostling. Reload and discard your changes, or overwrite external changes?”  
     → Options: [Reload] [Overwrite] [Cancel]  
   - If user chooses “Reload”, discard in-memory changes and re-render from disk

6. **First-launch defaults**  
   - Ship with a sensible, pre-populated default relay list (both read/write appropriately set)  
   - Never show an empty relay screen

#### Benefits
- Instant performance tuning (order + read/write)  
- Scales to 50+ relays without UI collapse  
- Works offline and survives app crashes (file is source of truth)  
- Plays nicely with external tools, scripts, git-backed configs  
- Prevents silent data loss from concurrent edits
