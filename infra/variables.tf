variable "project_id" {
  description = "The Google Cloud project that hosts the bot."
  type        = string
  default     = "fade-house-bot"
}

variable "region" {
  description = "Region for everything, one of the three with a free-tier e2-micro."
  type        = string
  default     = "us-west1"
}

variable "zone" {
  description = "Zone of the VM and its data disk."
  type        = string
  default     = "us-west1-b"
}

variable "budget_usd" {
  description = "Monthly budget that triggers email alerts. It alerts, it does not cap spending."
  type        = number
  default     = 5
}

variable "github_repository_id" {
  description = "GitHub's numeric ID for Nathan-H-Nguyen/fade-house-discord-bot."
  type        = string
  default     = "1452238769"
}

variable "github_owner_id" {
  description = "GitHub's numeric ID for the repository's owner."
  type        = string
  default     = "146505094"
}
