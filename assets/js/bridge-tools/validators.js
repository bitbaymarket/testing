const Validators = {
    // Validates 0-9 only. Returns "0" if invalid.
    // Use for: balance, totalSupply, block numbers, weights
    safeBN: (input) => {
        if (!input) return "0";
        const str = String(input);
        return /^\d+$/.test(str) ? str : "0";
    },

    // Validates Ethereum address (0x + 40 hex chars). Returns null if invalid.
    // Use for: token addresses, user accounts, contract addresses
    safeAddress: (input) => {
        if (!input) return null;
        return /^0x[a-fA-F0-9]{40}$/.test(input) ? input : null;
    },

    // Validates generic hex string (0x + any hex). Returns null if invalid.
    // Use for: transaction hashes, vote hashes, payloads
    safeHex: (input) => {
        if (!input) return null;
        return /^0x[a-fA-F0-9]*$/.test(input) ? input : null;
    },

    // Validates boolean. Returns false if not explicitly true.
    // Use for: flags like claimPeriod, paused states
    safeBool: (input) => {
        return String(input).toLowerCase() === 'true';
    },

    // Validates signed integer (optional minus, then digits). Returns "0" if invalid.
    // Use for: tick values, signed offsets, int24/int256 returns
    safeInt: (input) => {
        if (!input && input !== 0) return "0";
        const str = String(input);
        return /^-?\d+$/.test(str) ? str : "0";
    },

    // Validates alphanumeric string with common safe characters. Returns "" if invalid.
    // Use for: token names, symbols, UI display strings
    safeString: (input) => {
        if (!input) return "";
        const str = String(input);
        return /^[a-zA-Z0-9 ._\-:\/]+$/.test(str) ? str : "";
    }
};
