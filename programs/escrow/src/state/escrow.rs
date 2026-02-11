use anchor_lang::prelude::*;

#[account]
pub struct Escrow {
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub amount: u64,
    pub status: EscrowStatus,
    pub created_at: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum EscrowStatus {
    Initialized,
    Active,
    Completed,
    Cancelled,
    Disputed,
}

impl Escrow {
    pub const LEN: usize = 8  // discriminator
        + 32  // buyer
        + 32  // seller
        + 8   // amount
        + 1   // enum
        + 8   // created_at
        + 1;  // bump

    pub fn is_active(&self) -> bool {
        self.status == EscrowStatus::Active
    }

    pub fn can_release(&self) -> bool {
        matches!(self.status, EscrowStatus::Active)
    }

    pub fn can_cancel(&self) -> bool {
        matches!(self.status, EscrowStatus::Initialized | EscrowStatus::Active)
    }

    pub fn is_finalized(&self) -> bool {
        matches!(self.status, EscrowStatus::Completed | EscrowStatus::Cancelled)
    }
}