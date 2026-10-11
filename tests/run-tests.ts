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

    // 5. Duplicate Detection: Content fingerprint (exact file_size + duration_seconds)
    console.log("\nTest 5: Duplicate detection via content fingerprint (file_size + duration)");
    const dupByFingerprint = await createVideo({
      telegramFileId: `file_different_id_${Date.now()}`,
      fileUniqueId: `unique_different_${Date.now()}`,
      fileSize: testFileSize,
      durationSeconds: testDuration,
      caption: "Re-uploaded video as new file to channel",
    });
    assert(dupByFingerprint.isDuplicate, "Should detect duplicate via file_size + duration fingerprint");
    assert(dupByFingerprint.duplicateReason === "content_fingerprint", "Reason should be content_fingerprint");
    assert(dupByFingerprint.video.id === createdVideoId, "Should return existing video record");

    // 6. Non-duplicate with different file_size or duration
    console.log("\nTest 6: Distinct video with different size/duration should NOT be duplicate");
    const distinctCheck = await findDuplicateVideo({
      fileSize: testFileSize + 999,
      durationSeconds: testDuration,
      fileUniqueId: `unique_brand_new_${Date.now()}`,
    });
    assert(distinctCheck === null, "Distinct video should return null duplicate check");

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
