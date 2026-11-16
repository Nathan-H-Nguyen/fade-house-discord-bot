output "image_repository" {
  description = "Where to push images of the bot."
  value       = "${local.repository}/bot"
}

output "vm_name" {
  value = google_compute_instance.bot.name
}
