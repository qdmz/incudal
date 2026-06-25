-- AlterEnum: Add NodeType enum
CREATE TYPE "NodeType" AS ENUM ('incus', 'pve', 'lxd', 'kvm', 'external_api');

-- AlterTable: Add nodeType and PVE fields to hosts
ALTER TABLE "hosts" ADD COLUMN "node_type" "NodeType" NOT NULL DEFAULT 'incus';
ALTER TABLE "hosts" ADD COLUMN "pve_node_name" TEXT;
ALTER TABLE "hosts" ADD COLUMN "pve_storage_name" TEXT;
ALTER TABLE "hosts" ADD COLUMN "pve_bridge_name" TEXT;
ALTER TABLE "hosts" ADD COLUMN "pve_username" TEXT;
ALTER TABLE "hosts" ADD COLUMN "pve_password" TEXT;
ALTER TABLE "hosts" ADD COLUMN "pve_realm" TEXT;
ALTER TABLE "hosts" ADD COLUMN "pve_otp" TEXT;
ALTER TABLE "hosts" ADD COLUMN "pve_ssh_port" INTEGER;