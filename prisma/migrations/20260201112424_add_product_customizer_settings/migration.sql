-- CreateTable
CREATE TABLE "ProductCustomizerSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "enableSize" BOOLEAN NOT NULL DEFAULT true,
    "enablePrecut" BOOLEAN NOT NULL DEFAULT true,
    "enableQuantity" BOOLEAN NOT NULL DEFAULT true,
    "enablePlacement" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductCustomizerSettings_shop_productId_key" ON "ProductCustomizerSettings"("shop", "productId");
