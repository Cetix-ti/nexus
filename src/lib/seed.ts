import { PrismaClient, UserRole, TicketStatus, TicketPriority, TicketUrgency, TicketImpact, TicketType, TicketSource } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding Nexus database...\n");

  // ==========================================================================
  // Clean existing data
  // ==========================================================================
  console.log("Cleaning existing data...");
  await prisma.activity.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.ticketTag.deleteMany();
  await prisma.ticketAsset.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.sLAPolicy.deleteMany();
  await prisma.queue.deleteMany();
  await prisma.category.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.article.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.automationRule.deleteMany();
  await prisma.userOrganization.deleteMany();
  await prisma.site.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();

  // ==========================================================================
  // Users
  // ==========================================================================
  console.log("Creating users...");
  const passwordHash = await hash("admin123", 12);
  const techPasswordHash = await hash("tech123", 12);

  const admin = await prisma.user.create({
    data: {
      email: "admin@nexus.local",
      passwordHash,
      firstName: "Marc",
      lastName: "Dupont",
      role: UserRole.MSP_ADMIN,
    },
  });

  const tech1 = await prisma.user.create({
    data: {
      email: "tech1@nexus.local",
      passwordHash: techPasswordHash,
      firstName: "Sophie",
      lastName: "Martin",
      role: UserRole.TECHNICIAN,
    },
  });

  const tech2 = await prisma.user.create({
    data: {
      email: "tech2@nexus.local",
      passwordHash: techPasswordHash,
      firstName: "Lucas",
      lastName: "Bernard",
      role: UserRole.TECHNICIAN,
    },
  });

  console.log(`  Created admin: ${admin.email}`);
  console.log(`  Created tech1: ${tech1.email}`);
  console.log(`  Created tech2: ${tech2.email}`);

  // ==========================================================================
  // Organizations
  // ==========================================================================
  console.log("Creating organizations...");

  const cetix = await prisma.organization.create({
    data: {
      name: "Cetix MSP",
      slug: "cetix",
      domain: "cetix.io",
      plan: "enterprise",
    },
  });

  const acme = await prisma.organization.create({
    data: {
      name: "Acme Corp",
      slug: "acme-corp",
      domain: "acme-corp.com",
      plan: "standard",
    },
  });

  const techstart = await prisma.organization.create({
    data: {
      name: "TechStart Inc",
      slug: "techstart",
      domain: "techstart.io",
      plan: "standard",
    },
  });

  console.log(`  Created: ${cetix.name}, ${acme.name}, ${techstart.name}`);

  // ==========================================================================
  // User-Organization Assignments
  // ==========================================================================
  console.log("Assigning users to organizations...");

  await prisma.userOrganization.createMany({
    data: [
      { userId: admin.id, organizationId: cetix.id, role: UserRole.MSP_ADMIN, isDefault: true },
      { userId: admin.id, organizationId: acme.id, role: UserRole.MSP_ADMIN },
      { userId: admin.id, organizationId: techstart.id, role: UserRole.MSP_ADMIN },
      { userId: tech1.id, organizationId: cetix.id, role: UserRole.TECHNICIAN, isDefault: true },
      { userId: tech1.id, organizationId: acme.id, role: UserRole.TECHNICIAN },
      { userId: tech2.id, organizationId: cetix.id, role: UserRole.TECHNICIAN, isDefault: true },
      { userId: tech2.id, organizationId: techstart.id, role: UserRole.TECHNICIAN },
    ],
  });

  // ==========================================================================
  // Sites
  // ==========================================================================
  console.log("Creating sites...");

  const cetixHQ = await prisma.site.create({
    data: {
      organizationId: cetix.id,
      name: "Cetix HQ",
      address: "123 Rue de la Tech",
      city: "Montreal",
      state: "QC",
      postalCode: "H2X 1Y4",
      country: "Canada",
      isMain: true,
    },
  });

  const acmeHQ = await prisma.site.create({
    data: {
      organizationId: acme.id,
      name: "Acme Headquarters",
      address: "456 Business Blvd",
      city: "Toronto",
      state: "ON",
      postalCode: "M5V 2T6",
      country: "Canada",
      isMain: true,
    },
  });

  const acmeBranch = await prisma.site.create({
    data: {
      organizationId: acme.id,
      name: "Acme Branch Office",
      address: "789 Industrial Ave",
      city: "Ottawa",
      state: "ON",
      postalCode: "K1A 0A6",
      country: "Canada",
    },
  });

  const techstartHQ = await prisma.site.create({
    data: {
      organizationId: techstart.id,
      name: "TechStart Office",
      address: "321 Startup Lane",
      city: "Vancouver",
      state: "BC",
      postalCode: "V6B 1A1",
      country: "Canada",
      isMain: true,
    },
  });

  // ==========================================================================
  // Contacts
  // ==========================================================================
  console.log("Creating contacts...");

  const contactAlice = await prisma.contact.create({
    data: {
      organizationId: acme.id,
      siteId: acmeHQ.id,
      firstName: "Alice",
      lastName: "Johnson",
      email: "alice@acme-corp.com",
      phone: "+1-416-555-0101",
      jobTitle: "Office Manager",
      isVIP: true,
    },
  });

  const contactBob = await prisma.contact.create({
    data: {
      organizationId: acme.id,
      siteId: acmeBranch.id,
      firstName: "Bob",
      lastName: "Williams",
      email: "bob@acme-corp.com",
      phone: "+1-613-555-0202",
      jobTitle: "Developer",
    },
  });

  const contactCarla = await prisma.contact.create({
    data: {
      organizationId: techstart.id,
      siteId: techstartHQ.id,
      firstName: "Carla",
      lastName: "Davis",
      email: "carla@techstart.io",
      phone: "+1-604-555-0303",
      jobTitle: "CTO",
      isVIP: true,
    },
  });

  const contactDaniel = await prisma.contact.create({
    data: {
      organizationId: techstart.id,
      siteId: techstartHQ.id,
      firstName: "Daniel",
      lastName: "Chen",
      email: "daniel@techstart.io",
      jobTitle: "Engineer",
    },
  });

  const contactEva = await prisma.contact.create({
    data: {
      organizationId: acme.id,
      siteId: acmeHQ.id,
      firstName: "Eva",
      lastName: "Tremblay",
      email: "eva@acme-corp.com",
      jobTitle: "HR Director",
    },
  });

  // ==========================================================================
  // Categories
  // ==========================================================================
  console.log("Creating categories...");

  const categories = await Promise.all([
    prisma.category.create({
      data: { name: "Hardware", description: "Hardware issues and requests", icon: "Monitor", sortOrder: 0 },
    }),
    prisma.category.create({
      data: { name: "Software", description: "Software issues and requests", icon: "AppWindow", sortOrder: 1 },
    }),
    prisma.category.create({
      data: { name: "Network", description: "Network and connectivity issues", icon: "Wifi", sortOrder: 2 },
    }),
    prisma.category.create({
      data: { name: "Account", description: "Account and access management", icon: "UserCog", sortOrder: 3 },
    }),
    prisma.category.create({
      data: { name: "Other", description: "General and uncategorized requests", icon: "HelpCircle", sortOrder: 4 },
    }),
  ]);

  const [catHardware, catSoftware, catNetwork, catAccount, catOther] = categories;

  // Subcategories
  await Promise.all([
    prisma.category.create({ data: { name: "Laptop", parentId: catHardware.id, sortOrder: 0 } }),
    prisma.category.create({ data: { name: "Desktop", parentId: catHardware.id, sortOrder: 1 } }),
    prisma.category.create({ data: { name: "Printer", parentId: catHardware.id, sortOrder: 2 } }),
    prisma.category.create({ data: { name: "Email", parentId: catSoftware.id, sortOrder: 0 } }),
    prisma.category.create({ data: { name: "Microsoft 365", parentId: catSoftware.id, sortOrder: 1 } }),
    prisma.category.create({ data: { name: "VPN", parentId: catNetwork.id, sortOrder: 0 } }),
    prisma.category.create({ data: { name: "Wi-Fi", parentId: catNetwork.id, sortOrder: 1 } }),
    prisma.category.create({ data: { name: "Password Reset", parentId: catAccount.id, sortOrder: 0 } }),
    prisma.category.create({ data: { name: "New Account", parentId: catAccount.id, sortOrder: 1 } }),
  ]);

  // ==========================================================================
  // Queues
  // ==========================================================================
  console.log("Creating queues...");

  const qGeneral = await prisma.queue.create({
    data: { name: "General", description: "Default queue for all tickets", isDefault: true },
  });

  const qUrgent = await prisma.queue.create({
    data: { name: "Urgent", description: "High-priority and critical tickets" },
  });

  const qProjects = await prisma.queue.create({
    data: { name: "Projects", description: "Project-related tasks and changes" },
  });

  // ==========================================================================
  // SLA Policies
  // ==========================================================================
  console.log("Creating SLA policies...");

  const slaCritical = await prisma.sLAPolicy.create({
    data: {
      name: "Critical SLA",
      description: "For critical priority tickets",
      priority: TicketPriority.CRITICAL,
      firstResponseMinutes: 15,
      resolutionMinutes: 240,
    },
  });

  const slaHigh = await prisma.sLAPolicy.create({
    data: {
      name: "High SLA",
      description: "For high priority tickets",
      priority: TicketPriority.HIGH,
      firstResponseMinutes: 60,
      resolutionMinutes: 480,
    },
  });

  const slaMedium = await prisma.sLAPolicy.create({
    data: {
      name: "Medium SLA",
      description: "For medium priority tickets",
      priority: TicketPriority.MEDIUM,
      firstResponseMinutes: 240,
      resolutionMinutes: 1440,
    },
  });

  const slaLow = await prisma.sLAPolicy.create({
    data: {
      name: "Low SLA",
      description: "For low priority tickets",
      priority: TicketPriority.LOW,
      firstResponseMinutes: 480,
      resolutionMinutes: 2880,
    },
  });

  // ==========================================================================
  // Tags
  // ==========================================================================
  console.log("Creating tags...");

  await prisma.tag.createMany({
    data: [
      { name: "VIP", color: "#EF4444" },
      { name: "Recurring", color: "#F59E0B" },
      { name: "Security", color: "#8B5CF6" },
      { name: "Onboarding", color: "#10B981" },
      { name: "End of Life", color: "#6B7280" },
    ],
  });

  // ==========================================================================
  // Sample Tickets
  // ==========================================================================
  console.log("Creating sample tickets...");

  const now = new Date();
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);
  const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
  const hoursFromNow = (h: number) => new Date(now.getTime() + h * 60 * 60 * 1000);

  const ticketDefs = [
    {
      organizationId: acme.id,
      siteId: acmeHQ.id,
      requesterId: contactAlice.id,
      assigneeId: tech1.id,
      creatorId: admin.id,
      categoryId: catNetwork.id,
      queueId: qUrgent.id,
      slaPolicyId: slaCritical.id,
      subject: "Complete network outage at headquarters",
      description: "All employees at the HQ office have lost network connectivity. No internet access, no internal resources. Switches appear to be unresponsive.",
      status: TicketStatus.IN_PROGRESS,
      priority: TicketPriority.CRITICAL,
      urgency: TicketUrgency.CRITICAL,
      impact: TicketImpact.CRITICAL,
      type: TicketType.INCIDENT,
      source: TicketSource.PHONE,
      createdAt: hoursAgo(2),
      dueAt: hoursFromNow(2),
    },
    {
      organizationId: acme.id,
      siteId: acmeHQ.id,
      requesterId: contactAlice.id,
      assigneeId: tech1.id,
      creatorId: tech1.id,
      categoryId: catHardware.id,
      queueId: qGeneral.id,
      slaPolicyId: slaHigh.id,
      subject: "CEO laptop not booting after Windows update",
      description: "Alice reports that the CEO laptop is stuck on a blue screen after the latest Windows update was applied overnight. This is blocking executive meetings.",
      status: TicketStatus.OPEN,
      priority: TicketPriority.HIGH,
      urgency: TicketUrgency.HIGH,
      impact: TicketImpact.MEDIUM,
      type: TicketType.INCIDENT,
      source: TicketSource.PORTAL,
      createdAt: hoursAgo(5),
      dueAt: hoursFromNow(3),
    },
    {
      organizationId: acme.id,
      siteId: acmeBranch.id,
      requesterId: contactBob.id,
      assigneeId: tech2.id,
      creatorId: admin.id,
      categoryId: catSoftware.id,
      queueId: qGeneral.id,
      slaPolicyId: slaMedium.id,
      subject: "Cannot access shared drive from branch office",
      description: "Bob at the Ottawa branch cannot map network drives. Getting access denied errors. Other users at the same site are not affected.",
      status: TicketStatus.WAITING_CLIENT,
      priority: TicketPriority.MEDIUM,
      urgency: TicketUrgency.MEDIUM,
      impact: TicketImpact.LOW,
      type: TicketType.INCIDENT,
      source: TicketSource.EMAIL,
      createdAt: daysAgo(1),
      dueAt: hoursFromNow(12),
    },
    {
      organizationId: techstart.id,
      siteId: techstartHQ.id,
      requesterId: contactCarla.id,
      assigneeId: tech1.id,
      creatorId: tech1.id,
      categoryId: catNetwork.id,
      queueId: qGeneral.id,
      slaPolicyId: slaMedium.id,
      subject: "VPN connection drops every 30 minutes",
      description: "Carla reports persistent VPN disconnections when working remotely. Connection drops exactly every 30 minutes, requiring manual reconnection.",
      status: TicketStatus.IN_PROGRESS,
      priority: TicketPriority.MEDIUM,
      urgency: TicketUrgency.HIGH,
      impact: TicketImpact.MEDIUM,
      type: TicketType.INCIDENT,
      source: TicketSource.PORTAL,
      createdAt: daysAgo(2),
      dueAt: hoursFromNow(8),
    },
    {
      organizationId: techstart.id,
      siteId: techstartHQ.id,
      requesterId: contactDaniel.id,
      creatorId: admin.id,
      categoryId: catAccount.id,
      queueId: qGeneral.id,
      slaPolicyId: slaLow.id,
      subject: "New employee onboarding - Daniel Chen",
      description: "Please set up the following for new employee Daniel Chen: email account, VPN access, Microsoft 365 license, laptop provisioning, and badge access.",
      status: TicketStatus.NEW,
      priority: TicketPriority.LOW,
      urgency: TicketUrgency.LOW,
      impact: TicketImpact.LOW,
      type: TicketType.SERVICE_REQUEST,
      source: TicketSource.PORTAL,
      createdAt: hoursAgo(8),
      dueAt: hoursFromNow(40),
    },
    {
      organizationId: acme.id,
      siteId: acmeHQ.id,
      requesterId: contactEva.id,
      assigneeId: tech2.id,
      creatorId: tech2.id,
      categoryId: catHardware.id,
      queueId: qGeneral.id,
      slaPolicyId: slaMedium.id,
      subject: "Printer on 3rd floor not printing",
      description: "The HP LaserJet on the 3rd floor shows as online but print jobs get stuck in the queue. Tried restarting the printer. Paper trays are full.",
      status: TicketStatus.RESOLVED,
      priority: TicketPriority.LOW,
      urgency: TicketUrgency.LOW,
      impact: TicketImpact.LOW,
      type: TicketType.INCIDENT,
      source: TicketSource.PHONE,
      createdAt: daysAgo(3),
      resolvedAt: daysAgo(2),
    },
    {
      organizationId: acme.id,
      siteId: acmeHQ.id,
      requesterId: contactAlice.id,
      assigneeId: tech1.id,
      creatorId: admin.id,
      categoryId: catSoftware.id,
      queueId: qProjects.id,
      slaPolicyId: slaMedium.id,
      subject: "Microsoft 365 migration for accounting team",
      description: "Migrate the 12-person accounting team from on-premise Exchange to Microsoft 365. Includes mailbox migration, OneDrive setup, and Teams configuration.",
      status: TicketStatus.SCHEDULED,
      priority: TicketPriority.MEDIUM,
      urgency: TicketUrgency.LOW,
      impact: TicketImpact.HIGH,
      type: TicketType.CHANGE,
      source: TicketSource.PORTAL,
      createdAt: daysAgo(5),
      dueAt: hoursFromNow(72),
    },
    {
      organizationId: techstart.id,
      siteId: techstartHQ.id,
      requesterId: contactCarla.id,
      assigneeId: tech2.id,
      creatorId: tech2.id,
      categoryId: catNetwork.id,
      queueId: qUrgent.id,
      slaPolicyId: slaHigh.id,
      subject: "Firewall blocking SaaS application",
      description: "The new web application the dev team uses (Linear) is being blocked by the firewall. Need to add it to the allowlist. Blocking all sprint planning.",
      status: TicketStatus.OPEN,
      priority: TicketPriority.HIGH,
      urgency: TicketUrgency.HIGH,
      impact: TicketImpact.MEDIUM,
      type: TicketType.INCIDENT,
      source: TicketSource.CHAT,
      createdAt: hoursAgo(3),
      dueAt: hoursFromNow(5),
    },
    {
      organizationId: acme.id,
      siteId: acmeBranch.id,
      requesterId: contactBob.id,
      assigneeId: tech1.id,
      creatorId: tech1.id,
      categoryId: catHardware.id,
      queueId: qGeneral.id,
      slaPolicyId: slaLow.id,
      subject: "Request for second monitor",
      description: "Bob is requesting a second monitor for his workstation. Manager has approved the purchase.",
      status: TicketStatus.WAITING_VENDOR,
      priority: TicketPriority.LOW,
      urgency: TicketUrgency.LOW,
      impact: TicketImpact.LOW,
      type: TicketType.SERVICE_REQUEST,
      source: TicketSource.PORTAL,
      createdAt: daysAgo(4),
      dueAt: hoursFromNow(96),
    },
    {
      organizationId: acme.id,
      siteId: acmeHQ.id,
      requesterId: contactAlice.id,
      assigneeId: tech2.id,
      creatorId: admin.id,
      categoryId: catSoftware.id,
      queueId: qGeneral.id,
      slaPolicyId: slaMedium.id,
      subject: "Outlook crashes when opening attachments",
      description: "Alice reports Outlook crashes every time she tries to open PDF attachments. Started after the last Office update. Happens consistently.",
      status: TicketStatus.CLOSED,
      priority: TicketPriority.MEDIUM,
      urgency: TicketUrgency.MEDIUM,
      impact: TicketImpact.LOW,
      type: TicketType.INCIDENT,
      source: TicketSource.PORTAL,
      createdAt: daysAgo(7),
      resolvedAt: daysAgo(6),
      closedAt: daysAgo(5),
    },
    {
      organizationId: techstart.id,
      siteId: techstartHQ.id,
      requesterId: contactDaniel.id,
      assigneeId: tech1.id,
      creatorId: tech1.id,
      categoryId: catAccount.id,
      queueId: qGeneral.id,
      slaPolicyId: slaMedium.id,
      subject: "Password reset for all staging servers",
      description: "Security audit requires rotating all passwords for staging environment servers. 8 servers total.",
      status: TicketStatus.IN_PROGRESS,
      priority: TicketPriority.MEDIUM,
      urgency: TicketUrgency.MEDIUM,
      impact: TicketImpact.MEDIUM,
      type: TicketType.SERVICE_REQUEST,
      source: TicketSource.PORTAL,
      createdAt: daysAgo(1),
      dueAt: hoursFromNow(24),
    },
    {
      organizationId: acme.id,
      siteId: acmeHQ.id,
      requesterId: contactEva.id,
      creatorId: admin.id,
      categoryId: catOther.id,
      queueId: qGeneral.id,
      slaPolicyId: slaMedium.id,
      subject: "Conference room AV system not working",
      description: "The projector and sound system in Conference Room A are not working. Board meeting scheduled for tomorrow morning.",
      status: TicketStatus.NEW,
      priority: TicketPriority.HIGH,
      urgency: TicketUrgency.HIGH,
      impact: TicketImpact.MEDIUM,
      type: TicketType.INCIDENT,
      source: TicketSource.PHONE,
      createdAt: hoursAgo(1),
      dueAt: hoursFromNow(8),
    },
    {
      organizationId: techstart.id,
      siteId: techstartHQ.id,
      requesterId: contactCarla.id,
      assigneeId: tech2.id,
      creatorId: admin.id,
      categoryId: catNetwork.id,
      queueId: qProjects.id,
      slaPolicyId: slaMedium.id,
      subject: "Set up new office Wi-Fi access points",
      description: "TechStart is expanding to the 4th floor. Need to install and configure 6 new access points with proper segmentation (corporate, guest, IoT).",
      status: TicketStatus.SCHEDULED,
      priority: TicketPriority.MEDIUM,
      urgency: TicketUrgency.LOW,
      impact: TicketImpact.MEDIUM,
      type: TicketType.CHANGE,
      source: TicketSource.PORTAL,
      createdAt: daysAgo(3),
      dueAt: hoursFromNow(120),
    },
    {
      organizationId: acme.id,
      siteId: acmeHQ.id,
      requesterId: contactAlice.id,
      assigneeId: tech1.id,
      creatorId: tech1.id,
      categoryId: catSoftware.id,
      queueId: qGeneral.id,
      slaPolicyId: slaLow.id,
      subject: "Install Adobe Creative Suite on marketing laptops",
      description: "Marketing team (5 users) needs Adobe Creative Suite installed. Licenses have been purchased and are available in the admin portal.",
      status: TicketStatus.IN_PROGRESS,
      priority: TicketPriority.LOW,
      urgency: TicketUrgency.LOW,
      impact: TicketImpact.LOW,
      type: TicketType.SERVICE_REQUEST,
      source: TicketSource.EMAIL,
      createdAt: daysAgo(2),
      dueAt: hoursFromNow(48),
    },
    {
      organizationId: acme.id,
      siteId: acmeBranch.id,
      requesterId: contactBob.id,
      assigneeId: tech2.id,
      creatorId: tech2.id,
      categoryId: catNetwork.id,
      queueId: qUrgent.id,
      slaPolicyId: slaHigh.id,
      subject: "Intermittent internet at Ottawa branch",
      description: "Users at the Ottawa branch experience internet drops lasting 5-10 minutes, happening 3-4 times per day. ISP says line is clean.",
      status: TicketStatus.OPEN,
      priority: TicketPriority.HIGH,
      urgency: TicketUrgency.HIGH,
      impact: TicketImpact.HIGH,
      type: TicketType.PROBLEM,
      source: TicketSource.PORTAL,
      createdAt: daysAgo(1),
      dueAt: hoursFromNow(4),
      isOverdue: true,
    },
    {
      organizationId: techstart.id,
      siteId: techstartHQ.id,
      requesterId: contactDaniel.id,
      creatorId: admin.id,
      categoryId: catAccount.id,
      queueId: qGeneral.id,
      slaPolicyId: slaLow.id,
      subject: "Revoke access for departed employee",
      description: "Former employee (jsmith@techstart.io) left the company. Please disable all accounts: email, VPN, GitHub, AWS console, and Slack.",
      status: TicketStatus.NEW,
      priority: TicketPriority.MEDIUM,
      urgency: TicketUrgency.HIGH,
      impact: TicketImpact.LOW,
      type: TicketType.SERVICE_REQUEST,
      source: TicketSource.PORTAL,
      createdAt: hoursAgo(4),
      dueAt: hoursFromNow(4),
    },
    {
      organizationId: acme.id,
      siteId: acmeHQ.id,
      requesterId: contactEva.id,
      assigneeId: tech1.id,
      creatorId: tech1.id,
      categoryId: catHardware.id,
      queueId: qGeneral.id,
      slaPolicyId: slaMedium.id,
      subject: "Replace failing hard drive in file server",
      description: "RAID controller on the file server reports a degraded array. Disk 3 is showing SMART errors and needs replacement before full failure.",
      status: TicketStatus.IN_PROGRESS,
      priority: TicketPriority.HIGH,
      urgency: TicketUrgency.CRITICAL,
      impact: TicketImpact.HIGH,
      type: TicketType.INCIDENT,
      source: TicketSource.MONITORING,
      createdAt: hoursAgo(6),
      dueAt: hoursFromNow(2),
      isEscalated: true,
    },
    {
      organizationId: acme.id,
      siteId: acmeHQ.id,
      requesterId: contactAlice.id,
      assigneeId: tech2.id,
      creatorId: admin.id,
      categoryId: catOther.id,
      queueId: qGeneral.id,
      slaPolicyId: slaLow.id,
      subject: "Inventory audit of all office equipment",
      description: "Annual IT inventory audit. Need to scan and verify all tracked assets at headquarters. Report due by end of month.",
      status: TicketStatus.CANCELLED,
      priority: TicketPriority.LOW,
      urgency: TicketUrgency.LOW,
      impact: TicketImpact.LOW,
      type: TicketType.SERVICE_REQUEST,
      source: TicketSource.PORTAL,
      createdAt: daysAgo(10),
      closedAt: daysAgo(8),
    },
  ];

  const tickets = [];
  for (const def of ticketDefs) {
    const ticket = await prisma.ticket.create({ data: def });
    tickets.push(ticket);
  }

  console.log(`  Created ${tickets.length} tickets`);

  // ==========================================================================
  // Comments
  // ==========================================================================
  console.log("Creating comments...");

  // Comments for ticket 0 (network outage)
  await prisma.comment.create({
    data: {
      ticketId: tickets[0].id,
      authorId: tech1.id,
      body: "On-site now. The core switch appears to have lost power. Investigating the UPS.",
      isInternal: false,
      createdAt: hoursAgo(1.5),
    },
  });

  await prisma.comment.create({
    data: {
      ticketId: tickets[0].id,
      authorId: tech1.id,
      body: "UPS battery failed. Running on direct power now. Network is partially restored. Ordering replacement UPS.",
      isInternal: false,
      createdAt: hoursAgo(1),
    },
  });

  await prisma.comment.create({
    data: {
      ticketId: tickets[0].id,
      authorId: admin.id,
      body: "Approved emergency purchase of APC Smart-UPS 3000VA. Vendor confirms same-day delivery.",
      isInternal: true,
      createdAt: hoursAgo(0.5),
    },
  });

  // Comments for ticket 1 (CEO laptop)
  await prisma.comment.create({
    data: {
      ticketId: tickets[1].id,
      authorId: tech1.id,
      body: "Attempting to boot in safe mode. If that fails, will need to roll back the Windows update from recovery mode.",
      isInternal: false,
      createdAt: hoursAgo(4),
    },
  });

  // Comments for ticket 2 (shared drive)
  await prisma.comment.create({
    data: {
      ticketId: tickets[2].id,
      authorId: tech2.id,
      body: "Checked AD permissions - they look correct. Can you verify the exact error message you see? Is it 'Access Denied' or 'Network path not found'?",
      isInternal: false,
      createdAt: hoursAgo(20),
    },
  });

  // Comments for ticket 3 (VPN drops)
  await prisma.comment.create({
    data: {
      ticketId: tickets[3].id,
      authorId: tech1.id,
      body: "Looks like a session timeout issue. The VPN concentrator has a 30-minute idle timeout configured. Adjusting to 8 hours.",
      isInternal: false,
      createdAt: daysAgo(1),
    },
  });

  await prisma.comment.create({
    data: {
      ticketId: tickets[3].id,
      authorId: tech1.id,
      body: "Timeout adjusted. Carla, please test and let us know if the disconnections continue.",
      isInternal: false,
      createdAt: hoursAgo(22),
    },
  });

  // Internal note on ticket 7 (firewall)
  await prisma.comment.create({
    data: {
      ticketId: tickets[7].id,
      authorId: tech2.id,
      body: "Need to verify Linear's IP ranges before adding firewall rules. Checking their documentation.",
      isInternal: true,
      createdAt: hoursAgo(2),
    },
  });

  // ==========================================================================
  // Activities
  // ==========================================================================
  console.log("Creating activities...");

  // Activities for ticket 0
  await prisma.activity.create({
    data: {
      ticketId: tickets[0].id,
      userId: admin.id,
      action: "created",
      createdAt: hoursAgo(2),
    },
  });

  await prisma.activity.create({
    data: {
      ticketId: tickets[0].id,
      userId: admin.id,
      action: "assigned",
      field: "assigneeId",
      newValue: tech1.id,
      createdAt: hoursAgo(2),
    },
  });

  await prisma.activity.create({
    data: {
      ticketId: tickets[0].id,
      userId: tech1.id,
      action: "status_changed",
      field: "status",
      oldValue: "NEW",
      newValue: "IN_PROGRESS",
      createdAt: hoursAgo(1.5),
    },
  });

  // Activities for ticket 1
  await prisma.activity.create({
    data: {
      ticketId: tickets[1].id,
      userId: tech1.id,
      action: "created",
      createdAt: hoursAgo(5),
    },
  });

  await prisma.activity.create({
    data: {
      ticketId: tickets[1].id,
      userId: tech1.id,
      action: "status_changed",
      field: "status",
      oldValue: "NEW",
      newValue: "OPEN",
      createdAt: hoursAgo(4.5),
    },
  });

  // Activities for ticket 5 (resolved printer)
  await prisma.activity.create({
    data: {
      ticketId: tickets[5].id,
      userId: tech2.id,
      action: "status_changed",
      field: "status",
      oldValue: "IN_PROGRESS",
      newValue: "RESOLVED",
      createdAt: daysAgo(2),
    },
  });

  // Activities for ticket 9 (closed Outlook)
  await prisma.activity.create({
    data: {
      ticketId: tickets[9].id,
      userId: tech2.id,
      action: "status_changed",
      field: "status",
      oldValue: "RESOLVED",
      newValue: "CLOSED",
      createdAt: daysAgo(5),
    },
  });

  // Activities for ticket 16 (escalated file server)
  await prisma.activity.create({
    data: {
      ticketId: tickets[16].id,
      userId: admin.id,
      action: "escalated",
      field: "isEscalated",
      oldValue: "false",
      newValue: "true",
      createdAt: hoursAgo(4),
    },
  });

  console.log("\nSeed completed successfully!");
  console.log("---");
  console.log("Login credentials:");
  console.log("  Admin:  admin@nexus.local / admin123");
  console.log("  Tech 1: tech1@nexus.local / tech123");
  console.log("  Tech 2: tech2@nexus.local / tech123");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
