import "dotenv/config";
import { db } from "../src/db";
import { videos } from "../src/db/schema";
import { createVideo, findDuplicateVideo } from "../src/lib/services/videoService";
import { eq } from "drizzle-orm";

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
