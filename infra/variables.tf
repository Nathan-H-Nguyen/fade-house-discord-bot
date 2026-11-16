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
