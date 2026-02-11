use anchor_lang::prelude::*;

#[constant]
pub const ESCROW_SEED: &[u8] = b"escrow";

#[constant]
pub const REPUTATION_SEED: &[u8] = b"reputation";

// Minimum escrow amount in lamports (0.01 SOL)
pub const MIN_ESCROW_AMOUNT: u64 = 10_000_000;

// Maximum escrow amount in lamports (1000 SOL)
pub const MAX_ESCROW_AMOUNT: u64 = 1_000_000_000_000;

// Dispute window in seconds (7 days)
pub const DISPUTE_WINDOW: i64 = 7 * 24 * 60 * 60;

// Timeout period in seconds (30 days)
pub const TIMEOUT_PERIOD: i64 = 30 * 24 * 60 * 60;