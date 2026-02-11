use anchor_lang::prelude::*;

mod constants;
mod errors;
mod events;
mod instructions;
mod state;

pub use constants::*;
pub use errors::*;
pub use events::*;
pub use instructions::*;
pub use state::*;

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
