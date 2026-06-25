-- AlterTable: add PVE VMID field to instances
ALTER TABLE "instances" ADD COLUMN "pve_vmid" INTEGER;