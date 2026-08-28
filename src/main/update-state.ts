// Set while an update is being applied so shutdown paths skip anything
// that could delay or hang process exit - the installer/swap script is
// waiting on this process to die.
let updating = false;

export function setUpdating(value: boolean) {
  updating = value;
}

export function isUpdating(): boolean {
  return updating;
}
