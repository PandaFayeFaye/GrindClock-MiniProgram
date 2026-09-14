// Placeholder for Phase 2: the mini program targets mainland WeChat users, so
// full zh/en bilingual support is lower priority than on the web app -- this
// just satisfies the DictKey type that schedule.ts/pet.ts reference for their
// (currently unused-in-Phase-1) label keys. Replace with a real dictionary
// once the UI pages that consume these labels get built.
export type DictKey = string;
