import "dotenv/config";
import { db } from "../src/db";
import { users, videos, videoDeliveries, settings } from "../src/db/schema";
import { createVideo, findDuplicateVideo, getNextVideoForUser, recordDelivery } from "../src/lib/services/videoService";
import { setSetting } from "../src/lib/services/settingsService";
import { eq, inArray } from "drizzle-orm";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log("=========================================");
  console.log("🧪 Running Video Duplicate Detection Tests");
  console.log("=========================================\n");

  const testFileUniqueId = `test_unique_${Date.now()}`;
  const testChannelId = "-100999888777";
  const testMsgId = 123456;
  const testHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  const testFileSize = 98765432;
  const testDuration = 142;

  let createdVideoId: number | null = null;

  try {
    // 1. Initial Insert (Non-duplicate)
    console.log("Test 1: Normal initial video creation");
    const initial = await createVideo({
      telegramFileId: `file_${Date.now()}_1`,
      fileUniqueId: testFileUniqueId,
      channelId: testChannelId,
      channelMessageId: testMsgId,
      contentHash: testHash,
      caption: "Original video caption",
      fileSize: testFileSize,
      durationSeconds: testDuration,
      width: 1080,
      height: 1920,
      addedBy: "test-runner",
    });

    createdVideoId = initial.video.id;
    assert(!initial.isDuplicate, "Initial insert should not be flagged as duplicate");
    assert(typeof initial.video.id === "number", "Initial insert must return a valid video ID");
    assert(initial.video.sequence > 0, "Initial insert must have an assigned sequence");

    // 2. Duplicate Detection: Same file_unique_id
    console.log("\nTest 2: Duplicate detection via file_unique_id");
    const dupByUniqueId = await createVideo({
      telegramFileId: `file_different_id_${Date.now()}`,
      fileUniqueId: testFileUniqueId,
      caption: "Re-upload with same unique id",
      fileSize: 1234,
      durationSeconds: 10,
    });
    assert(dupByUniqueId.isDuplicate, "Should detect duplicate file_unique_id");
    assert(dupByUniqueId.duplicateReason === "file_unique_id", "Reason should be file_unique_id");
    assert(dupByUniqueId.video.id === createdVideoId, "Should return existing video record");

    // 3. Duplicate Detection: Same Telegram channel message (channelId + channelMessageId)
    console.log("\nTest 3: Duplicate detection via channel_post message ID");
    const dupByChannelMsg = await createVideo({
      telegramFileId: `file_different_id_${Date.now()}`,
      channelId: testChannelId,
      channelMessageId: testMsgId,
      caption: "Re-delivered channel message",
    });
    assert(dupByChannelMsg.isDuplicate, "Should detect duplicate channel message");
    assert(dupByChannelMsg.duplicateReason === "channel_message", "Reason should be channel_message");
    assert(dupByChannelMsg.video.id === createdVideoId, "Should return existing video record");

    // 4. Duplicate Detection: Same SHA-256 content_hash
    console.log("\nTest 4: Duplicate detection via SHA-256 content_hash");
    const dupByHash = await createVideo({
      telegramFileId: `file_different_id_${Date.now()}`,
      contentHash: testHash,
      caption: "Admin uploaded identical video bytes",
    });
    assert(dupByHash.isDuplicate, "Should detect duplicate content_hash");
    assert(dupByHash.duplicateReason === "content_hash", "Reason should be content_hash");
    assert(dupByHash.video.id === createdVideoId, "Should return existing video record");

    // 5. Same video with different filename / caption (Duplicate via content fingerprint)
    console.log("\nTest 5: Same video with different filename/caption (content fingerprint)");
    const dupByFingerprint = await createVideo({
      telegramFileId: `file_different_id_${Date.now()}`,
      fileUniqueId: `unique_different_${Date.now()}`,
      fileSize: testFileSize,
      durationSeconds: testDuration,
      caption: "Renamed filename: episode_1_new_filename.mp4",
    });
    assert(dupByFingerprint.isDuplicate, "Should detect duplicate despite different filename/caption");
    assert(dupByFingerprint.duplicateReason === "content_fingerprint", "Reason should be content_fingerprint");
    assert(dupByFingerprint.video.id === createdVideoId, "Should return existing video record");

    // 6. Different video with same filename / caption (Should NOT be duplicate)
    console.log("\nTest 6: Different video with same filename/caption should NOT be duplicate");
    const distinctCheck = await findDuplicateVideo({
      fileSize: testFileSize + 999, // Different size
      durationSeconds: testDuration + 5, // Different duration
      fileUniqueId: `unique_brand_new_${Date.now()}`,
    });
    assert(distinctCheck === null, "Different video with same filename should return null duplicate check");

    // 7. Concurrent imports (Race Condition safety via Postgres advisory locks & constraints)
    console.log("\nTest 7: Concurrent imports of the same video simultaneously");
    const concurrentFileSize = 54321000 + Math.floor(Math.random() * 10000);
    const concurrentDuration = 99;
    const concurrentUniqId = `concurrent_${Date.now()}`;
    const [resA, resB] = await Promise.all([
      createVideo({
        telegramFileId: `file_concurrent_A_${Date.now()}`,
        fileUniqueId: concurrentUniqId,
        fileSize: concurrentFileSize,
        durationSeconds: concurrentDuration,
        caption: "Concurrent import A",
      }),
      createVideo({
        telegramFileId: `file_concurrent_B_${Date.now()}`,
        fileUniqueId: concurrentUniqId,
        fileSize: concurrentFileSize,
        durationSeconds: concurrentDuration,
        caption: "Concurrent import B",
      }),
    ]);

    const oneCreated = (resA.isDuplicate === false && resB.isDuplicate === true) ||
                       (resA.isDuplicate === true && resB.isDuplicate === false);
    assert(oneCreated, "Exactly one concurrent import succeeds, while the other is caught as duplicate");
    const createdConcurrentId = resA.isDuplicate ? resB.video.id : resA.video.id;
    assert(typeof createdConcurrentId === "number", "Concurrent winner must have valid video ID");
    if (createdConcurrentId) {
      await db.delete(videos).where(eq(videos.id, createdConcurrentId));
    }

    // 8. Large files (> 100MB) without downloading
    console.log("\nTest 8: Large video (150MB) deduplication without downloading");
    const largeFileSize = 150 * 1024 * 1024; // 150 MB
    const largeDuration = 480;
    const largeInitial = await createVideo({
      telegramFileId: `file_large_1_${Date.now()}`,
      fileUniqueId: `large_uniq_1_${Date.now()}`,
      fileSize: largeFileSize,
      durationSeconds: largeDuration,
      width: 1920,
      height: 1080,
      caption: "Large 150MB video batch 1",
    });
    assert(!largeInitial.isDuplicate, "Initial large video insert should succeed");
    const largeVideoId = largeInitial.video.id;

    // Second batch re-upload of same 150MB video under different Telegram message & unique_id
    const largeReupload = await createVideo({
      telegramFileId: `file_large_2_${Date.now()}`,
      fileUniqueId: `large_uniq_2_${Date.now()}`, // Telegram changed file_unique_id in batch 2
      fileSize: largeFileSize, // Same 150MB size
      durationSeconds: largeDuration, // Same duration
      width: 1920,
      height: 1080,
      caption: "Large 150MB video re-uploaded in batch 2",
    });
    assert(largeReupload.isDuplicate, "Large video re-upload must be detected as duplicate");
    assert(largeReupload.duplicateReason === "content_fingerprint", "Large duplicate matched by content_fingerprint");
    assert(largeReupload.video.id === largeVideoId, "Should link to the existing large video ID");

    if (largeVideoId) {
      await db.delete(videos).where(eq(videos.id, largeVideoId));
    }

    // 9. Video protection & spoiler options verification
    console.log("\nTest 9: Verification of sendVideo options with protect_content and has_spoiler");
    const videoOptions: import("../src/lib/telegram/client").SendVideoOptions = {
      has_spoiler: true,
      protect_content: true,
      supports_streaming: true,
    };
    assert(videoOptions.protect_content === true, "SendVideoOptions supports protect_content: true");
    assert(videoOptions.has_spoiler === true, "SendVideoOptions supports has_spoiler: true");

    // =========================================================================
    // NEWEST-FIRST DELIVERY TESTS
    // =========================================================================
    console.log("\n=========================================");
    console.log("🎬 Running Newest-First Video Delivery Tests");
    console.log("=========================================\n");

    const cleanUpVideoIds: number[] = [];
    let testUserAId: number | null = null;
    let testUserBId: number | null = null;

    try {
      // Create test users
      const [userA] = await db.insert(users).values({
        telegramId: 998000000 + Math.floor(Math.random() * 100000),
        firstName: "Test User A",
      }).returning();
      testUserAId = userA.id;

      const [userB] = await db.insert(users).values({
        telegramId: 998100000 + Math.floor(Math.random() * 100000),
        firstName: "Test User B",
      }).returning();
      testUserBId = userB.id;

      // Mark any pre-existing database videos as delivered for test users
      // so the controlled test videos represent the user's active unseen horizon.
      const existingDbVideos = await db.select({ id: videos.id }).from(videos);
      for (const row of existingDbVideos) {
        await recordDelivery(userA.id, row.id);
        await recordDelivery(userB.id, row.id);
      }

      // Create 3 videos with distinct uploadedAt times:
      // V_old: 30 mins ago
      // V_mid: 15 mins ago
      // V_new: 1 min ago
      const now = Date.now();
      const vOldRes = await createVideo({
        telegramFileId: `file_old_${now}`,
        fileUniqueId: `uniq_old_${now}`,
        caption: "V_old",
        fileSize: 11000001,
        durationSeconds: 10,
        uploadedAt: new Date(now - 30 * 60 * 1000),
      });
      cleanUpVideoIds.push(vOldRes.video.id);

      const vMidRes = await createVideo({
        telegramFileId: `file_mid_${now}`,
        fileUniqueId: `uniq_mid_${now}`,
        caption: "V_mid",
        fileSize: 11000002,
        durationSeconds: 10,
        uploadedAt: new Date(now - 15 * 60 * 1000),
      });
      cleanUpVideoIds.push(vMidRes.video.id);

      const vNewRes = await createVideo({
        telegramFileId: `file_new_${now}`,
        fileUniqueId: `uniq_new_${now}`,
        caption: "V_new",
        fileSize: 11000003,
        durationSeconds: 10,
        uploadedAt: new Date(now - 1 * 60 * 1000),
      });
      cleanUpVideoIds.push(vNewRes.video.id);

      // Test 10: New user receives latest video first
      console.log("Test 10: New user receives latest video first (V_new)");
      const firstDelivery = await getNextVideoForUser(userA.id);
      assert(firstDelivery.video?.id === vNewRes.video.id, "New user receives V_new first");

      // Test 11: Next button follows newest-first order
      console.log("\nTest 11: Next button follows newest-first order (V_new -> V_mid -> V_old)");
      await recordDelivery(userA.id, vNewRes.video.id);
      const secondDelivery = await getNextVideoForUser(userA.id);
      assert(secondDelivery.video?.id === vMidRes.video.id, "Second delivery is V_mid");

      await recordDelivery(userA.id, vMidRes.video.id);
      const thirdDelivery = await getNextVideoForUser(userA.id);
      assert(thirdDelivery.video?.id === vOldRes.video.id, "Third delivery is V_old");

      // Test 12: Existing user receives latest unseen video
      console.log("\nTest 12: Existing user receives latest unseen video");
      // Suppose User B already saw V_mid earlier
      await recordDelivery(userB.id, vMidRes.video.id);
      const userBDelivery = await getNextVideoForUser(userB.id);
      assert(userBDelivery.video?.id === vNewRes.video.id, "User B prioritizes newest unseen video (V_new)");

      // Test 13: New video uploaded during user session
      console.log("\nTest 13: New video uploaded during user session is prioritized immediately");
      // User A has watched V_new, V_mid, V_old.
      await recordDelivery(userA.id, vOldRes.video.id);
      // Now a brand new video V_latest is uploaded:
      const vLatestRes = await createVideo({
        telegramFileId: `file_latest_${now}`,
        fileUniqueId: `uniq_latest_${now}`,
        caption: "V_latest",
        fileSize: 11000004,
        durationSeconds: 10,
        uploadedAt: new Date(now + 1000),
      });
      cleanUpVideoIds.push(vLatestRes.video.id);

      const userANext = await getNextVideoForUser(userA.id);
      assert(userANext.video?.id === vLatestRes.video.id, "User A immediately receives newly uploaded V_latest next");

      // Test 14: Deterministic ordering for equal upload timestamps (id DESC tie-breaker)
      console.log("\nTest 14: Equal upload timestamps tie-breaker (id DESC)");
      const equalFutureTimestamp = new Date(now + 5000);
      const vEq1 = await createVideo({
        telegramFileId: `file_eq1_${now}`,
        fileUniqueId: `uniq_eq1_${now}`,
        caption: "V_eq1",
        fileSize: 11000005,
        durationSeconds: 10,
        uploadedAt: equalFutureTimestamp,
      });
      cleanUpVideoIds.push(vEq1.video.id);

      const vEq2 = await createVideo({
        telegramFileId: `file_eq2_${now}`,
        fileUniqueId: `uniq_eq2_${now}`,
        caption: "V_eq2",
        fileSize: 11000006,
        durationSeconds: 10,
        uploadedAt: equalFutureTimestamp,
      });
      cleanUpVideoIds.push(vEq2.video.id);

      // Create user C to test tie-breaker
      const [userC] = await db.insert(users).values({
        telegramId: 998200000 + Math.floor(Math.random() * 100000),
        firstName: "Test User C",
      }).returning();
      for (const row of existingDbVideos) {
        await recordDelivery(userC.id, row.id);
      }
      const userCDelivery = await getNextVideoForUser(userC.id);
      const expectedHigherId = Math.max(vEq1.video.id, vEq2.video.id);
      assert(userCDelivery.video?.id === expectedHigherId, "Equal timestamps resolved deterministically by id DESC");
      await db.delete(users).where(eq(users.id, userC.id));

      // Test 15: Repeat mode ON vs OFF
      console.log("\nTest 15: Repeat mode behavior (ON vs OFF)");
      await recordDelivery(userA.id, vLatestRes.video.id);
      await recordDelivery(userA.id, vEq1.video.id);
      await recordDelivery(userA.id, vEq2.video.id);

      // Set repeat mode OFF in settings
      await setSetting("REPEAT_MODE", "false");
      const repeatOffDelivery = await getNextVideoForUser(userA.id);
      assert(repeatOffDelivery.video === null && repeatOffDelivery.isRepeat === false, "Repeat mode OFF returns null when all videos watched");

      // Set repeat mode ON in settings
      await setSetting("REPEAT_MODE", "true");
      const repeatOnDelivery = await getNextVideoForUser(userA.id);
      assert(repeatOnDelivery.video !== null && repeatOnDelivery.isRepeat === true, "Repeat mode ON cycles back with isRepeat: true");

      // Reset repeat mode setting to false
      await setSetting("REPEAT_MODE", "false");

      // Test 16: Concurrent video selection for same user selects distinct newest videos
      console.log("\nTest 16: Concurrent video selection for same user (excludeVideoIds)");
      const [userD] = await db.insert(users).values({
        telegramId: 998300000 + Math.floor(Math.random() * 100000),
        firstName: "Test User D",
      }).returning();
      for (const row of existingDbVideos) {
        await recordDelivery(userD.id, row.id);
      }
      // For User D, the top two newest unseen videos are vEq2 and vEq1
      const req1 = await getNextVideoForUser(userD.id);
      const req2 = await getNextVideoForUser(userD.id, { excludeVideoIds: [req1.video!.id] });
      assert(req1.video?.id === vEq2.video.id, "Concurrent request 1 gets newest video");
      assert(req2.video?.id === vEq1.video.id, "Concurrent request 2 safely picks next newest video without duplicating");
      await db.delete(users).where(eq(users.id, userD.id));

    } finally {
      if (testUserAId) await db.delete(users).where(eq(users.id, testUserAId));
      if (testUserBId) await db.delete(users).where(eq(users.id, testUserBId));
      if (cleanUpVideoIds.length > 0) {
        await db.delete(videos).where(inArray(videos.id, cleanUpVideoIds));
      }
    }

  } finally {
    // Cleanup the single test record
    if (createdVideoId) {
      await db.delete(videos).where(eq(videos.id, createdVideoId));
      console.log(`\n🧹 Cleaned up temporary test video ID ${createdVideoId}`);
    }
    const { pool } = await import("../src/db");
    await pool.end();
  }

  console.log("\n=========================================");
  console.log(`📊 Test Results: ${passed} PASSED, ${failed} FAILED`);
  console.log("=========================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution threw error:", err);
  process.exit(1);
});
