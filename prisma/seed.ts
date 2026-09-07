import { PrismaClient, type AssignmentType, type CertificationStatus, type VerificationStatus } from "@prisma/client";

const prisma = new PrismaClient();

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 86400000);
}

const CERTIFICATIONS = [
  { code: "AZ-104", name: "Microsoft Azure Administrator Associate", provider: "Microsoft", validityMonths: 24, description: "Manage Azure identities, governance, storage, compute and virtual networks.", goldReward: 300, featured: true, note: "Foundation for all Azure roles." },
  { code: "AZ-204", name: "Microsoft Azure Developer Associate", provider: "Microsoft", validityMonths: 24, description: "Develop solutions for compute, storage, security and Azure DevOps.", goldReward: 450, featured: true, note: "High demand on the platform team." },
  { code: "AZ-305", name: "Microsoft Azure Solutions Architect Expert", provider: "Microsoft", validityMonths: 24, description: "Design scalable, resilient and cost-effective Azure solutions.", goldReward: 550, featured: true, note: "Expert-level, big impact." },
  { code: "AZ-400", name: "Microsoft Azure DevOps Engineer Expert", provider: "Microsoft", validityMonths: 24, description: "Design and implement DevOps processes and practices on Azure.", goldReward: 520, featured: false, note: null },
  { code: "AWS-SAA", name: "AWS Certified Solutions Architect – Associate", provider: "AWS", validityMonths: 36, description: "Architect secure, reliable and cost-optimized workloads on AWS.", goldReward: 420, featured: true, note: "Growing AWS footprint." },
] as const;

const USERS = [
  { email: "admin@company.com", name: "Ada Admin", role: "ADMIN" as const },
  { email: "john@company.com", name: "John Doe", role: "MEMBER" as const },
  { email: "alice@company.com", name: "Alice Nguyen", role: "MEMBER" as const },
  { email: "bob@company.com", name: "Bob Smith", role: "MEMBER" as const },
  { email: "carol@company.com", name: "Carol Tran", role: "MEMBER" as const },
  { email: "dave@company.com", name: "Dave Lee", role: "MEMBER" as const },
] as const;

interface SeedAssignment {
  email: string;
  code: string;
  type: AssignmentType;
  deadlineDays?: number;
  exempted?: string;
  memberCert?: {
    status: CertificationStatus;
    progress: number;
    verification?: VerificationStatus;
    issuedDays?: number;
    expirationDays?: number;
    certNumber?: string;
  };
}

const ASSIGNMENTS: SeedAssignment[] = [
  // ---- John ----
  { email: "john@company.com", code: "AZ-204", type: "REQUIRED", deadlineDays: 60, memberCert: { status: "LEARNING", progress: 70 } },
  { email: "john@company.com", code: "AZ-305", type: "REQUIRED", deadlineDays: -15, memberCert: { status: "LEARNING", progress: 20 } },
  { email: "john@company.com", code: "AZ-400", type: "REQUIRED", deadlineDays: -45 },
  { email: "john@company.com", code: "AZ-104", type: "REQUIRED", deadlineDays: -30, memberCert: { status: "CERTIFIED", progress: 100, verification: "VERIFIED", issuedDays: -400, expirationDays: 330, certNumber: "AZ104-88213" } },
  { email: "john@company.com", code: "AWS-SAA", type: "RECOMMENDED" },
  // ---- Alice ----
  { email: "alice@company.com", code: "AZ-204", type: "REQUIRED", deadlineDays: 30, memberCert: { status: "LEARNING", progress: 40 } },
  { email: "alice@company.com", code: "AZ-305", type: "REQUIRED", deadlineDays: -28, memberCert: { status: "LEARNING", progress: 60 } },
  { email: "alice@company.com", code: "AZ-400", type: "REQUIRED", deadlineDays: -10 },
  { email: "alice@company.com", code: "AZ-104", type: "REQUIRED", deadlineDays: -90, memberCert: { status: "CERTIFIED", progress: 100, verification: "VERIFIED", issuedDays: -720, expirationDays: 320, certNumber: "AZ104-99102" } },
  { email: "alice@company.com", code: "AWS-SAA", type: "RECOMMENDED" },
  // ---- Bob ----
  { email: "bob@company.com", code: "AZ-204", type: "REQUIRED", deadlineDays: 90 },
  { email: "bob@company.com", code: "AZ-104", type: "REQUIRED", deadlineDays: -60, memberCert: { status: "CERTIFIED", progress: 100, verification: "VERIFIED", issuedDays: -365, expirationDays: 355, certNumber: "AZ104-77120" } },
  { email: "bob@company.com", code: "AWS-SAA", type: "RECOMMENDED" },
  // ---- Carol ----
  { email: "carol@company.com", code: "AZ-305", type: "REQUIRED", exempted: "Role no longer requires AZ-305." },
  { email: "carol@company.com", code: "AZ-204", type: "REQUIRED", deadlineDays: 45, memberCert: { status: "LEARNING", progress: 80 } },
  { email: "carol@company.com", code: "AWS-SAA", type: "RECOMMENDED", memberCert: { status: "LEARNING", progress: 50 } },
  // ---- Dave ----
  { email: "dave@company.com", code: "AZ-400", type: "REQUIRED", deadlineDays: -5 },
  { email: "dave@company.com", code: "AZ-204", type: "REQUIRED", deadlineDays: -100, memberCert: { status: "CERTIFIED", progress: 100, verification: "VERIFIED", issuedDays: -730, expirationDays: 310, certNumber: "AZ204-55103" } },
  { email: "dave@company.com", code: "AWS-SAA", type: "RECOMMENDED" },
];

async function main() {
  console.log("Seeding database...");

  // Certifications
  const certIds = new Map<string, string>();
  for (const c of CERTIFICATIONS) {
    const cert = await prisma.certification.upsert({
      where: { code: c.code },
      update: {
        name: c.name,
        provider: c.provider,
        validityMonths: c.validityMonths,
        description: c.description,
        goldReward: c.goldReward,
        isRecommendedFeatured: c.featured,
        recommendedNote: c.note,
      },
      create: {
        code: c.code,
        name: c.name,
        provider: c.provider,
        validityMonths: c.validityMonths,
        description: c.description,
        goldReward: c.goldReward,
        isRecommendedFeatured: c.featured,
        recommendedNote: c.note,
      },
    });
    certIds.set(c.code, cert.id);
  }

  // Users
  const userIds = new Map<string, string>();
  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { displayName: u.name, role: u.role, isActive: true },
      create: {
        entraObjectId: `seed-${u.email}`,
        email: u.email,
        displayName: u.name,
        role: u.role,
      },
    });
    userIds.set(u.email, user.id);
  }

  const admin = await prisma.user.findUnique({ where: { email: "admin@company.com" } });

  // Clear existing assignments/member certs for the seed members to keep it idempotent.
  const memberEmails = USERS.filter((u) => u.role === "MEMBER").map((u) => u.email);
  const memberIds = memberEmails.map((e) => userIds.get(e)!);
  await prisma.memberCertification.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.certificationAssignment.deleteMany({ where: { memberId: { in: memberIds } } });

  // Assignments + member certifications
  for (const a of ASSIGNMENTS) {
    const memberId = userIds.get(a.email)!;
    const certificationId = certIds.get(a.code)!;

    const assignment = await prisma.certificationAssignment.create({
      data: {
        memberId,
        certificationId,
        type: a.type,
        deadline: a.deadlineDays !== undefined ? daysFromNow(a.deadlineDays) : null,
        exemptedAt: a.exempted ? new Date() : null,
        exemptedById: admin?.id ?? null,
        exemptionReason: a.exempted ?? null,
        status: a.exempted ? "EXEMPTED" : "NOT_STARTED",
      },
    });

    if (a.memberCert) {
      const mc = a.memberCert;
      await prisma.memberCertification.create({
        data: {
          memberId,
          certificationId,
          assignmentId: assignment.id,
          status: mc.status,
          progressPercent: mc.progress,
          verificationStatus: mc.verification ?? "PENDING",
          issuedDate: mc.issuedDays !== undefined ? daysFromNow(mc.issuedDays) : null,
          expirationDate: mc.expirationDays !== undefined ? daysFromNow(mc.expirationDays) : null,
          certificateNumber: mc.certNumber ?? null,
        },
      });
    }
  }

  console.log("Seed complete:");
  console.log(`  Certifications: ${CERTIFICATIONS.length}`);
  console.log(`  Users: ${USERS.length}`);
  console.log(`  Assignments: ${ASSIGNMENTS.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });