# CampusCare — Three-Tier Campus Service Desk on AWS

CampusCare is a small campus support-ticket portal. Students can create a request, select its category and priority, and follow its status as staff move it from Open to In Progress to Resolved. This repository includes a Dockerized web tier, REST API tier, PostgreSQL data tier, and Terraform infrastructure for AWS.

## Features

- Create support requests with title, details, category, and priority
- View the queue and filter by status
- Update a ticket's status or delete a request
- API health endpoint checks database connectivity
- Input validation and parameterized SQL queries
- Private database network; only the Nginx web entry point is published by Compose

## Architecture

```text
Browser
  │ HTTP :80
  ▼
Public EC2 proxy (Nginx reverse proxy / bastion)
  │ HTTP :80, restricted by security group
  ▼
Private EC2 instance
  ├── Frontend container: Nginx static UI
  │       └── /api/* proxied to Express
  ├── Backend container: Node.js + Express REST API
  └── Database container: PostgreSQL (internal Docker network)

AWS networking managed by Terraform: VPC, public/private subnets,
Internet Gateway, NAT Gateway, route tables, security groups, S3 endpoint.
```

## Repository layout

```text
app/
  frontend/       CampusCare UI and Nginx config
  backend/        Express REST API and PostgreSQL queries
  docker-compose.yml
  .env.example
terraform/        VPC, EC2, networking and bootstrap templates
README.md
```

## Run locally with Docker

Prerequisites: Docker Desktop with Compose v2.

1. Open PowerShell in the `app` directory.
2. Copy the example environment file and edit it to use a long local-only password:

   ```powershell
   Copy-Item .env.example .env
   notepad .env
   ```

3. Start the containers:

   ```powershell
   docker compose up --build -d
   ```

4. Open `http://localhost`. Check API/database status using `http://localhost/api/health`.
5. Stop the services with `docker compose down`. To also delete the local database volume, use `docker compose down -v` (this permanently deletes local ticket data).

Never commit `.env` or real passwords. `.env.example` should contain placeholders only.

## Deploy to AWS with Terraform

Prerequisites: AWS CLI credentials configured for your account, Terraform >= 1.5, an existing EC2 key pair in the selected region, and a public IP address for SSH allowlisting. Review AWS charges before deploying; the NAT Gateway and Elastic IP resources can incur costs.

1. Change to the Terraform directory:

   ```bash
   cd terraform
   cp terraform.tfvars.example terraform.tfvars
   ```

2. Edit `terraform.tfvars` and set your existing EC2 key pair name, your public IP as `admin_cidr` in `/32` format, and a unique strong alphanumeric `db_password` (at least 12 characters). Do not commit `terraform.tfvars`.
3. Preview and deploy:

   ```bash
   terraform init
   terraform fmt -recursive
   terraform validate
   terraform plan
   terraform apply
   ```

4. Wait for instance bootstrap to finish, then visit the `app_url` shown by Terraform.
5. Inspect logs on the private app host via the bastion if the site has not started: `/var/log/app-bootstrap.log`.

Terraform uploads the app bundle to a private S3 bucket and bootstraps the private instance with Docker Compose. Confirm the variables and infrastructure plan before applying it to your own AWS account.

## API reference

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | API and database health |
| GET | `/api/tickets` | List support tickets |
| POST | `/api/tickets` | Create a ticket |
| PATCH | `/api/tickets/:id` | Change status |
| DELETE | `/api/tickets/:id` | Delete a ticket |

Example create payload:

```json
{
  "title": "Wi-Fi unavailable in Block B",
  "details": "Unable to connect from the second floor",
  "category": "IT Support",
  "priority": "High"
}
```

Allowed priorities: `Low`, `Normal`, `High`, `Urgent`. Allowed statuses: `Open`, `In Progress`, `Resolved`.

## Security notes

- Do not commit AWS keys, `.pem` files, `.env`, `terraform.tfvars`, Terraform state, or real passwords.
- Restrict SSH to your own IP address; never use `0.0.0.0/0` for SSH.
- Database port 5432 and API port 5000 are not exposed as public host ports.
- This is an educational project, not a production-ready multi-user service: add authentication/authorization, HTTPS, backups, managed secrets, and monitoring before real use.

## Cost cleanup

When you finish testing, destroy the Terraform resources you created to avoid ongoing charges:

```bash
terraform destroy
```

Review the destroy plan and confirm it targets only this project. Deleting the resources can permanently remove data stored on them.

## Learning outcomes

This project demonstrates the three-tier request flow, container networking, REST API design, SQL persistence, reverse proxying, VPC segmentation, security groups, and infrastructure-as-code deployment. Update this README with your own screenshots, deployment details, and lessons learned after testing it.
