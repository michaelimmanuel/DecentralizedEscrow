use anchor_lang::prelude::*;

declare_id!("9X6QbCnVwTg1EjQDNt9KrT7rvJqPRVAUWfYCkNRZW9VY");

#[program]
pub mod escrow {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
