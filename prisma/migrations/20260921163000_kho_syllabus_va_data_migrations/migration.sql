-- CreateTable
CREATE TABLE "syllabus_catalog" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "levelId" TEXT,
    "level" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "totalCourseDays" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,

    CONSTRAINT "syllabus_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "syllabus_documents" (
    "syllabusId" TEXT NOT NULL,
    "document" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "syllabus_documents_pkey" PRIMARY KEY ("syllabusId")
);

-- CreateTable
CREATE TABLE "data_migrations" (
    "key" TEXT NOT NULL,
    "ranAt" TEXT NOT NULL,

    CONSTRAINT "data_migrations_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "syllabus_catalog_position_idx" ON "syllabus_catalog"("position");
