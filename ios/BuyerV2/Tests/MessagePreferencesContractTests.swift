import Foundation
import Testing

@testable import BuyerV2

private struct PreferencesFetchFixture: Decodable {
    let hasStoredPreferences: Bool
    let channels: ChannelEnablement
    let categories: CategoryEnablement

    var preferences: MessagePreferences {
        MessagePreferences(channels: channels, categories: categories)
    }
}

@Suite("Message preference JSON contracts")
struct MessagePreferencesContractTests {

    private func fixtureURL(_ name: String) -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("src/test/fixtures/contracts/\(name)")
    }

    @Test("Swift decodes the shared fetch response fixture")
    func decodesFetchFixture() throws {
        let data = try Data(contentsOf: fixtureURL("message-preferences.fetch.json"))
        let decoded = try JSONDecoder().decode(PreferencesFetchFixture.self, from: data)

        #expect(decoded.hasStoredPreferences)
        #expect(decoded.preferences.channels.sms)
        #expect(!decoded.preferences.channels.push)
        #expect(!decoded.preferences.categories.tours)
        #expect(decoded.preferences.categories.marketing)
    }

    @Test("Swift decodes the shared stored preference fixture")
    func decodesStoredPreferencesFixture() throws {
        let data = try Data(contentsOf: fixtureURL("message-preferences.stored.json"))
        let decoded = try JSONDecoder().decode(MessagePreferences.self, from: data)

        #expect(decoded.channels.email)
        #expect(decoded.channels.sms)
        #expect(!decoded.channels.push)
        #expect(decoded.channels.inApp)
        #expect(decoded.categories.transactional)
        #expect(!decoded.categories.tours)
        #expect(decoded.categories.offers)
        #expect(decoded.categories.updates)
        #expect(decoded.categories.marketing)
    }
}
