/*
Copyright 2015, 2016 OpenMarket Ltd
Copyright 2017, 2018, 2019 New Vector Ltd
Copyright 2019 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import React from 'react';
import createReactClass from 'create-react-class';
import PropTypes from 'prop-types';
import { _t } from '../../../languageHandler';
import * as sdk from '../../../index';
import Modal from "../../../Modal";
import SdkConfig from "../../../SdkConfig";
import PasswordReset from "../../../PasswordReset";
import AutoDiscoveryUtils, {ValidatedServerConfig} from "../../../utils/AutoDiscoveryUtils";
import classNames from 'classnames';
import AuthPage from "../../views/auth/AuthPage";
import withValidation from "../../views/elements/Validation";
import PassphraseField from "../../../../src/components/views/auth/PassphraseField";
import Matrix from 'matrix-js-sdk';
import {PHASE_INTRO} from "../../../stores/SetupEncryptionStore";
// Phases
// Show controls to configure server details
const PHASE_SERVER_DETAILS = 0;
// Show the forgot password inputs
const PHASE_FORGOT = 1;
// Email is in the process of being sent
const PHASE_SENDING_EMAIL = 2;
// Email has been sent
const PHASE_EMAIL_SENT = 3;
// User has clicked the link in email and completed reset
const PHASE_DONE = 4;
const PHASE_PHONE_SENT = 5;
const FIELD_PASSWORD = 'field_password';
const FIELD_PASSWORD_CONFIRM = 'field_password_confirm';
const PASSWORD_MIN_SCORE = 3; // safely unguessable: moderate protection from offline slow-hash scenario.

export default createReactClass({
    displayName: 'ForgotPassword',

    propTypes: {
        clientSecret: PropTypes.string,
        sessionId: PropTypes.string,
        idSid: PropTypes.string,
        serverConfig: PropTypes.instanceOf(ValidatedServerConfig).isRequired,
        brand: PropTypes.string,
        onServerConfigChange: PropTypes.func.isRequired,
        onLoginClick: PropTypes.func,
        onComplete: PropTypes.func.isRequired,
    },

    getInitialState: function() {
        const cli = Matrix.createClient({
            baseUrl: this.props.serverConfig.hsUrl,
            idBaseUrl: this.props.serverConfig.isUrl,
        });
        return {
            phase: PHASE_FORGOT,
            email: "",
            phoneNumber: "",
            phoneCountry: "VN",
            phonePrefix:"84",
            password: "",
            password2: "",
            otp: "",
            sid: "",
            errorText: null,
            matrixClient: cli,
            // We perform liveliness checks later, but for now suppress the errors.
            // We also track the server dead errors independently of the regular errors so
            // that we can render it differently, and override any other error the user may
            // be seeing.
            serverIsAlive: true,
            serverErrorIsFatal: false,
            serverDeadError: "",
            serverRequiresIdServer: null,
        };
    },

    componentDidMount: function() {
        this.reset = null;
        this._checkServerLiveliness(this.props.serverConfig);
    },

    // TODO: [REACT-WARNING] Replace with appropriate lifecycle event
    UNSAFE_componentWillReceiveProps: function(newProps) {
        if (newProps.serverConfig.hsUrl === this.props.serverConfig.hsUrl &&
            newProps.serverConfig.isUrl === this.props.serverConfig.isUrl) return;

        // Do a liveliness check on the new URLs
        this._checkServerLiveliness(newProps.serverConfig);
    },

    _checkServerLiveliness: async function(serverConfig) {
        try {
            await AutoDiscoveryUtils.validateServerConfigWithStaticUrls(
                serverConfig.hsUrl,
                serverConfig.isUrl,
            );

            const pwReset = new PasswordReset(serverConfig.hsUrl, serverConfig.isUrl);
            const serverRequiresIdServer = await pwReset.doesServerRequireIdServerParam();

            this.setState({
                serverIsAlive: true,
                serverRequiresIdServer,
            });
        } catch (e) {
            this.setState(AutoDiscoveryUtils.authComponentStateForError(e, "forgot_password"));
        }
    },

    submitPasswordReset: function(country,phone, password) {
        this.setState({
            phase: PHASE_SENDING_EMAIL,
        });
        this.reset = new PasswordReset(this.props.serverConfig.hsUrl, this.props.serverConfig.isUrl);
        this.reset.resetPasswordPhone(country,phone, password).then((result) => {
            console.log(result)
            if (result!== undefined){
                this.setState({
                    phase: PHASE_PHONE_SENT,
                    sid:result['sid']
                });
            }
        }, (err) => {
            this.showErrorDialog(_t('Failed to send OTP') + ": " + err.message);
            this.setState({
                phase: PHASE_PHONE_SENT,
            });
        });
    },

    onVerify: async function(ev) {
        ev.preventDefault();
        if (!this.reset) {
            console.error("onVerify called before submitPasswordReset!");
            return;
        }
        try {
            await this.reset.checkEmailLinkClicked();
            this.setState({ phase: PHASE_DONE });
        } catch (err) {
            this.showErrorDialog(err.message);
        }
    },
    onVerifyPhoneNumber : async  function(ev){
        ev.preventDefault();
        ev.stopPropagation();
        console.log('PHASE_PHONE_SENT',PHASE_PHONE_SENT)
        this.setState({ phase: PHASE_PHONE_SENT });
    },
    onSubmitForm: async function(ev) {

        if (!this.state.phoneNumber||!this.state.phoneCountry) {
            this.showErrorDialog(_t('The phone of your account must be entered.'));

        } else if (!this.state.password || !this.state.password2) {
            this.showErrorDialog(_t('A new password must be entered.'));
        } else if (this.state.password !== this.state.password2) {
            this.showErrorDialog(_t('New passwords must match each other.'));
        } else {
            ev.preventDefault();
            this.setState({
                phase: PHASE_SENDING_EMAIL,
            });
            // refresh the server errors, just in case the server came back online
            await this._checkServerLiveliness(this.props.serverConfig);

            const QuestionDialog = sdk.getComponent("dialogs.QuestionDialog");
            Modal.createTrackedDialog('Forgot Password Warning', '', QuestionDialog, {
                title: _t('Warning!'),
                description:
                    <div>
                        { _t(
                            "Changing your password will reset any end-to-end encryption keys " +
                            "on all of your sessions, making encrypted chat history unreadable. Set up " +
                            "Key Backup or export your room keys from another session before resetting your " +
                            "password.",
                        ) }
                    </div>,
                button: _t('Continue'),
                onFinished: (confirmed) => {
                    if (confirmed) {
                        console.log(this.state.phoneCountry,this.state.phoneNumber)
                        this.submitPasswordReset(this.state.phoneCountry,this.state.phoneNumber, this.state.password);
                    }
                },
            });
        }
    },

    onPasswordValidate(fieldState) {
        return this.validatePasswordConfirmRules(fieldState);
    },

    async onPasswordConfirmValidate(fieldState) {
        return await this.validatePasswordConfirmRules(fieldState);
    },

    validatePasswordRules: withValidation({
        rules: [
            {
                key: "required",
                test: ({value, allowEmpty}) => allowEmpty || !!value,
                invalid: () => _t("Confirm password"),
            }
        ],
    }),
    validatePasswordConfirmRules: withValidation({
        rules: [
            {
                key: "required",
                test: ({value, allowEmpty}) => allowEmpty || !!value,
                invalid: () => _t("Confirm password"),
            },
            {
                key: "match",
                test: function ({value}) {
                    return !value || value === this.state.password;
                },
                invalid: () => _t("Passwords don't match"),
            },
        ],
    }),
    onInputChanged: function(stateKey, ev) {
        this.setState({
            [stateKey]: ev.target.value,
        });
    },
    onPhoneCountryChange(newVal) {
        console.log(newVal)
        this.setState({
            phoneCountry: newVal.iso2,
            phonePrefix: newVal.prefix,
        });
    },
    onOtpChange(ev) {
        this.setState({
            otp:  ev.target.value,
        });
    },
    onPhoneNumberChange(ev) {
        this.setState({
            phoneNumber: ev.target.value,
        });
    },
    async onServerDetailsNextPhaseClick() {
        this.setState({
            phase: PHASE_FORGOT,
        });
    },

    onEditServerDetailsClick(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        this.setState({
            phase: PHASE_SERVER_DETAILS,
        });
    },

    onLoginClick: function(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        this.props.onLoginClick();
    },

    showErrorDialog: function(body, title) {
        const ErrorDialog = sdk.getComponent("dialogs.ErrorDialog");
        Modal.createTrackedDialog('Forgot Password Error', '', ErrorDialog, {
            title: title,
            description: body,
        });
    },

    renderServerDetails() {
        const ServerConfig = sdk.getComponent("auth.ServerConfig");

        if (SdkConfig.get()['disable_custom_urls']) {
            return null;
        }

        return <ServerConfig
            serverConfig={this.props.serverConfig}
            onServerConfigChange={this.props.onServerConfigChange}
            delayTimeMs={0}
            showIdentityServerIfRequiredByHomeserver={true}
            onAfterSubmit={this.onServerDetailsNextPhaseClick}
            submitText={_t("Next")}
            submitClass="mx_Login_submit"
        />;
    },

    renderForgot() {
        const Field = sdk.getComponent('elements.Field');
        const CountryDropdown = sdk.getComponent('views.auth.CountryDropdown');
        let errorText = null;
        const err = this.state.errorText;
        if (err) {
            errorText = <div className="mx_Login_error">{ err }</div>;
        }

        let serverDeadSection;
        if (!this.state.serverIsAlive) {
            const classes = classNames({
                "mx_Login_error": true,
                "mx_Login_serverError": true,
                "mx_Login_serverErrorNonFatal": !this.state.serverErrorIsFatal,
            });
            serverDeadSection = (
                <div className={classes}>
                    {this.state.serverDeadError}
                </div>
            );
        }

        let yourMatrixAccountText = _t('Your Matrix account on %(serverName)s', {
            serverName: this.props.serverConfig.hsName,
        });
        if (this.props.serverConfig.hsNameIsDifferent) {
            const TextWithTooltip = sdk.getComponent("elements.TextWithTooltip");

            yourMatrixAccountText = _t('Your Matrix account on <underlinedServerName />', {}, {
                'underlinedServerName': () => {
                    return <TextWithTooltip
                        class="mx_Login_underlinedServerName"
                        tooltip={this.props.serverConfig.hsUrl}
                    >
                        {this.props.serverConfig.hsName}
                    </TextWithTooltip>;
                },
            });
        }

        // If custom URLs are allowed, wire up the server details edit link.
        let editLink = null;
        if (!SdkConfig.get()['disable_custom_urls']) {
            editLink = <a className="mx_AuthBody_editServerDetails"
                href="#" onClick={this.onEditServerDetailsClick}
            >
                {_t('Change')}
            </a>;
        }

        if (!this.props.serverConfig.isUrl && this.state.serverRequiresIdServer) {
            return <div>
                <h3>
                    {yourMatrixAccountText}
                    {editLink}
                </h3>
                {_t(
                    "No identity server is configured: " +
                    "add one in server settings to reset your password.",
                )}
                <a className="mx_AuthBody_changeFlow" onClick={this.onLoginClick} href="#">
                    {_t('Sign in instead')}
                </a>
            </div>;
        }
        const phoneCountry = <CountryDropdown
            value={this.state.phoneCountry}
            isSmall={true}
            showPrefix={true}
            onOptionChange={this.onPhoneCountryChange}
        />;
        return <div>
            {errorText}
            {serverDeadSection}
            <h3>
                {yourMatrixAccountText}
                {editLink}
            </h3>
            <form onSubmit={this.onSubmitForm}>
                <div className="mx_AuthBody_fieldRow">
                     {/*<Field*/}
                    {/*    name="reset_email" // define a name so browser's password autofill gets less confused*/}
                    {/*    type="text"*/}
                    {/*    label={_t('Email')}*/}
                    {/*    value={this.state.email}*/}
                    {/*    onChange={this.onInputChanged.bind(this, "email")}*/}
                    {/*    autoFocus*/}
                    {/*/>*/}
                    <Field
                        type="text"
                        label={_t("Phone")}
                        value={this.state.phoneNumber}
                        prefixComponent={phoneCountry}
                        onChange={this.onPhoneNumberChange}
                        autoFocus
                    />
                </div>
                <div className="mx_AuthBody_fieldRow">
                    <PassphraseField
                        name="reset_password"
                        type="password"
                        fieldRef={field => this[FIELD_PASSWORD] = field}
                        minScore={PASSWORD_MIN_SCORE}
                        value={this.state.password}
                        onChange={this.onInputChanged.bind(this, "password")}
                        onValidate={this.onPasswordValidate}
                    />
                    <Field
                        name="reset_password_confirm"
                        ref={field => this[FIELD_PASSWORD_CONFIRM] = field}
                        type="password"
                        autoComplete="new-password"
                        label={_t('Confirm')}
                        value={this.state.password2}
                        onChange={this.onInputChanged.bind(this, "password2")}
                        onValidate={this.onPasswordConfirmValidate}
                    />
                </div>
                <span>{_t(
                    'A verification OTP will be sent to your phone to confirm ' +
                    'setting your new password.',
                )}</span>
                <input
                    className="mx_Login_submit"
                    type="submit"
                    value={_t('Send OTP')}
                />
            </form>
            <a className="mx_AuthBody_changeFlow" onClick={this.onLoginClick} href="#">
                {_t('Sign in instead')}
            </a>
        </div>;
    },

    renderSendingEmail() {
        const Spinner = sdk.getComponent("elements.Spinner");
        return <Spinner />;
    },

    renderEmailSent() {
        return <div>
            {_t("An OTP has been sent to %(phone)s. Once you've followed the " +
                "link it contains, click below.", { phone: this.state.phonePrefix +this.state.phoneNumber })}
            <br />
            <input className="mx_Login_submit" type="button" onClick={this.onVerify}
                value={_t('I have verified my email address')} />
        </div>;
    },
    rendererOptSent(){
        const Field = sdk.getComponent('elements.Field');
        return <div>
        <form onSubmit={this._onSubmitOtp}>
            <div className="mx_AuthBody_fieldRow">
                <Field
                    type="text"
                    label={_t("OTP")}
                    value={this.state.otp}
                    autoFocus
                    onChange={this.onOtpChange}
                />
            </div>
            <span>{_t(
                'A verification OTP will be sent to your phone to confirm ' +
                'setting your new password.',
            )}</span>
            <input
                className="mx_Login_submit"
                type="submit"
                value={_t('Accept OTP')}
            />
        </form></div>;
    },
    async _onSubmitOtp(ev){
        console.log('PHASE_DONE',ev)
        await this.reset.requestChangePasswordNew(this.state.phonePrefix+this.state.phoneNumber,this.state.otp,this.state.password,this.state.sid).then((result) => {
            console.log('PHASE_DONE',result)
            if(result){
                this.setState({
                    phase: PHASE_DONE,
                });
            }else{
                this.showErrorDialog(_t('Wrong OTP code!') + ": " + err.message);
            }
        }, (err) => {
            this.showErrorDialog(_t('Failed to reset password') + ": " + err.message);
            // this.setState({
            //     phase: PHASE_PHONE_SENT,
            // });
        });
    },
    _getUIAuthInputs: function() {
        return {
            phoneCountry: this.state.phoneCountry,
            phoneNumber: this.state.phoneNumber,
        };
    },
    renderDone() {
        return <div>
            <p>{_t("Your password has been reset.")}</p>
            <p>{_t(
                "You have been logged out of all sessions and will no longer receive " +
                "push notifications. To re-enable notifications, sign in again on each " +
                "device.",
            )}</p>
            <input className="mx_Login_submit" type="button" onClick={this.props.onComplete}
                value={_t('Return to login screen')} />
        </div>;
    },

    render: function() {
        const AuthHeader = sdk.getComponent("auth.AuthHeader");
        const AuthBody = sdk.getComponent("auth.AuthBody");

        let resetPasswordJsx;
        switch (this.state.phase) {
            case PHASE_SERVER_DETAILS:
                resetPasswordJsx = this.renderServerDetails();
                break;
            case PHASE_FORGOT:
                resetPasswordJsx = this.renderForgot();
                break;
            case PHASE_SENDING_EMAIL:
                resetPasswordJsx = this.renderSendingEmail();
                break;
            case PHASE_EMAIL_SENT:
                resetPasswordJsx = this.renderEmailSent();
                break;
            case PHASE_PHONE_SENT:
                resetPasswordJsx = this.rendererOptSent();
                break;
            case PHASE_DONE:
                resetPasswordJsx = this.renderDone();
                break;
        }

        return (
            <AuthPage>
                <AuthHeader />
                <AuthBody>
                    <h2> { _t('Set a new password') } </h2>
                    {resetPasswordJsx}
                </AuthBody>
            </AuthPage>
        );
    },
});
