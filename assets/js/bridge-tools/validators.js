// Single validation function: checks input contains only a-zA-Z and 0-9.
// Covers all major return types from contract calls (numbers, addresses, hex, booleans).
// Returns the string if valid, empty string if not.
function validation(input) {
    if (!input && input !== 0) return "";
    const str = String(input);
    return /^[a-zA-Z0-9]+$/.test(str) ? str : "";
}
